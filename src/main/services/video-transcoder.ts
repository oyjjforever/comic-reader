/**
 * 视频转码修复服务
 * 用于修复异常 GOP（如 keyint=infinite）导致 Chromium 解码掉帧抖动的视频
 * 重新编码为标准 H.264 + 正常 GOP（keyint=240）+ faststart
 */
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { getFfmpegPath, getVideoDuration } from './ffmpeg-service'
import log from '../../utils/log'

/** 进度事件数据 */
export interface TranscodeProgress {
  /** 当前处理时间（秒） */
  currentTime: number
  /** 视频总时长（秒） */
  totalTime: number
  /** 进度百分比 0-100 */
  percent: number
  /** 编码速度（fps） */
  fps: number
  /** 阶段：probe 探测时长 / encode 编码中 / done 完成 */
  stage: 'probe' | 'encode' | 'done'
}

/** 当前正在进行的转码进程（用于取消） */
let currentProcess: ChildProcess | null = null

/** 全局转码状态（供渲染层随时查询，支持后台非阻塞模式） */
export interface TranscodeState {
  isRunning: boolean
  percent: number
  fps: number
  stage: 'idle' | 'probe' | 'encode' | 'done' | 'error' | 'cancelled'
  originalPath: string
  outputPath: string
  error?: string
}

let globalState: TranscodeState = {
  isRunning: false,
  percent: 0,
  fps: 0,
  stage: 'idle',
  originalPath: '',
  outputPath: ''
}

/** 获取当前转码状态 */
export function getTranscodeState(): TranscodeState {
  return { ...globalState }
}

/** 更新全局状态 */
function updateState(patch: Partial<TranscodeState>): void {
  globalState = { ...globalState, ...patch }
}

/**
 * 生成输出文件路径：与原文件同目录，文件名加 _fixed 后缀
 * 若已存在则追加数字
 */
function buildOutputPath(inputPath: string): string {
  const dir = path.dirname(inputPath)
  const ext = path.extname(inputPath)
  const base = path.basename(inputPath, ext)

  let candidate = path.join(dir, `${base}_fixed${ext}`)
  let n = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}_fixed${n}${ext}`)
    n++
  }
  return candidate
}

/**
 * 解析 ffmpeg stderr 行，提取 time= 和 fps=
 * 形如: frame= 1234 fps= 45 q=24.0 size= 1024kB time=00:01:23.45 bitrate=...
 */
function parseProgressLine(line: string): { time: number | null; fps: number | null } {
  let time: number | null = null
  let fps: number | null = null

  const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/)
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10)
    const m = parseInt(timeMatch[2], 10)
    const s = parseFloat(timeMatch[3])
    time = h * 3600 + m * 60 + s
  }

  const fpsMatch = line.match(/fps=\s*(\d+\.?\d*)/)
  if (fpsMatch) {
    fps = parseFloat(fpsMatch[1])
  }

  return { time, fps }
}

/**
 * 转码修复视频（修复异常 GOP）
 * @param inputPath 原视频完整路径
 * @param mainWindow 主窗口（用于发送进度事件）
 * @param onProgress 可选进度回调
 * @returns 输出文件路径
 * @throws 转码失败或被取消时抛出
 */
export async function transcodeVideo(
  inputPath: string,
  mainWindow: BrowserWindow,
  onProgress?: (p: TranscodeProgress) => void
): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`视频文件不存在: ${inputPath}`)
  }

  const ffmpegPath = getFfmpegPath()
  const outputPath = buildOutputPath(inputPath)

  // 初始化全局状态
  updateState({
    isRunning: true,
    percent: 0,
    fps: 0,
    stage: 'probe',
    originalPath: inputPath,
    outputPath,
    error: undefined
  })

  // 1. 探测视频总时长（用于计算进度百分比）
  sendProgress(mainWindow, onProgress, {
    currentTime: 0,
    totalTime: 0,
    percent: 0,
    fps: 0,
    stage: 'probe'
  })

  let totalDuration = 0
  try {
    totalDuration = await getVideoDuration(inputPath)
  } catch (e: any) {
    log.warn('[Transcoder] 探测时长失败，将无法显示精确进度:', e?.message)
  }

  log.info(`[Transcoder] 开始转码: ${inputPath} -> ${outputPath}`, {
    duration: totalDuration,
    ffmpeg: ffmpegPath
  })

  // 2. 构造 ffmpeg 命令（修复 GOP + faststart）
  const args = [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-g', '240',          // GOP 长度 240 帧（≈8秒@30fps）
    '-keyint_min', '24',
    '-bf', '3',
    '-refs', '3',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.1',
    '-c:a', 'copy',       // 音频直接复制，省时无损
    '-movflags', '+faststart',
    '-y',                 // 覆盖输出
    '-nostdin',           // 不从 stdin 读取，避免阻塞
    outputPath
  ]

  // 3. 启动 ffmpeg
  return new Promise<string>((resolve, reject) => {
    currentProcess = spawn(ffmpegPath, args, {
      windowsHide: true
    })

    let stderrBuffer = ''
    let lastReportTime = 0

    currentProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      stderrBuffer += text

      // 按行解析进度，限流 500ms 上报一次
      const now = Date.now()
      if (now - lastReportTime < 500 && !text.includes('\n')) return
      lastReportTime = now

      const { time, fps } = parseProgressLine(text)
      if (time !== null) {
        const percent = totalDuration > 0 ? Math.min(100, (time / totalDuration) * 100) : 0
        const rounded = Math.round(percent * 10) / 10
        updateState({ percent: rounded, fps: fps ?? 0, stage: 'encode' })
        sendProgress(mainWindow, onProgress, {
          currentTime: time,
          totalTime: totalDuration,
          percent: rounded,
          fps: fps ?? 0,
          stage: 'encode'
        })
      }
    })

    currentProcess.on('close', (code) => {
      currentProcess = null

      if (code === 0 && fs.existsSync(outputPath)) {
        const outSize = fs.statSync(outputPath).size
        log.info(`[Transcoder] 转码完成: ${outputPath}`, { size: outSize })

        updateState({ isRunning: false, percent: 100, fps: 0, stage: 'done' })

        sendProgress(mainWindow, onProgress, {
          currentTime: totalDuration,
          totalTime: totalDuration,
          percent: 100,
          fps: 0,
          stage: 'done'
        })

        // 通知渲染层转码完成（后台模式）
        sendComplete(mainWindow, { success: true, outputPath })

        resolve(outputPath)
      } else if (code === null) {
        // 进程被 kill（取消）
        log.info('[Transcoder] 转码已取消')
        cleanupFile(outputPath)
        updateState({ isRunning: false, stage: 'cancelled' })
        sendComplete(mainWindow, { success: false, error: '已取消' })
        reject(new Error('已取消'))
      } else {
        log.error(`[Transcoder] 转码失败，退出码: ${code}`, { stderrTail: stderrBuffer.slice(-2000) })
        cleanupFile(outputPath)
        const errMsg = `转码失败 (退出码 ${code})`
        updateState({ isRunning: false, stage: 'error', error: errMsg })
        sendComplete(mainWindow, { success: false, error: errMsg })
        reject(new Error(errMsg))
      }
    })

    currentProcess.on('error', (err) => {
      currentProcess = null
      log.error('[Transcoder] ffmpeg 启动失败:', err.message)
      updateState({ isRunning: false, stage: 'error', error: err.message })
      sendComplete(mainWindow, { success: false, error: `FFmpeg 启动失败: ${err.message}` })
      reject(new Error(`FFmpeg 启动失败: ${err.message}`))
    })
  })
}

/** 取消当前转码 */
export function cancelTranscode(): boolean {
  if (currentProcess && !currentProcess.killed) {
    try {
      currentProcess.kill()
      log.info('[Transcoder] 已发送取消信号')
      return true
    } catch (e: any) {
      log.warn('[Transcoder] 取消失败:', e?.message)
    }
  }
  return false
}

/**
 * 删除原始文件并（可选）将修复版重命名为原文件名
 * @param originalPath 原文件路径
 * @param fixedPath 修复版文件路径
 * @param renameToOriginal 是否将修复版重命名为原文件名
 */
export function replaceWithFixed(
  originalPath: string,
  fixedPath: string,
  renameToOriginal: boolean
): { success: boolean; error?: string; finalPath?: string } {
  try {
    // 删除原文件
    if (fs.existsSync(originalPath)) {
      fs.unlinkSync(originalPath)
      log.info(`[Transcoder] 已删除原文件: ${originalPath}`)
    }

    // 重命名修复版为原文件名
    if (renameToOriginal && fs.existsSync(fixedPath)) {
      fs.renameSync(fixedPath, originalPath)
      log.info(`[Transcoder] 已重命名为原文件名: ${originalPath}`)
      return { success: true, finalPath: originalPath }
    }

    return { success: true, finalPath: fixedPath }
  } catch (e: any) {
    log.error('[Transcoder] 替换文件失败:', e?.message)
    return { success: false, error: e?.message }
  }
}

/** 发送进度事件（同时通过 IPC 和回调） */
function sendProgress(
  mainWindow: BrowserWindow,
  onProgress: ((p: TranscodeProgress) => void) | undefined,
  progress: TranscodeProgress
): void {
  try {
    mainWindow.webContents.send('video:transcode-progress', progress)
  } catch {
    // 窗口可能已关闭
  }
  onProgress?.(progress)
}

/** 转码完成事件数据 */
export interface TranscodeComplete {
  success: boolean
  outputPath?: string
  originalPath?: string
  error?: string
}

/** 发送转码完成事件（后台非阻塞模式） */
function sendComplete(mainWindow: BrowserWindow, result: TranscodeComplete): void {
  try {
    mainWindow.webContents.send('video:transcode-complete', {
      ...result,
      originalPath: globalState.originalPath,
      outputPath: result.outputPath || globalState.outputPath
    })
  } catch {
    // 窗口可能已关闭
  }
}

/** 安全删除文件 */
function cleanupFile(filePath: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // 忽略
  }
}

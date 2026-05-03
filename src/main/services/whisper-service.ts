/**
 * Whisper 服务
 * 封装 whisper.cpp CLI 调用，支持渐进式生成和实时转录
 */
import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import crypto from 'crypto'
import type { WhisperModelName, SubtitleLanguage, SubtitleSegment, GenerateProgress } from '../../typings/subtitle'
import { getModelPath, isModelDownloaded } from './model-manager'
import { extractAudioFromVideo, getVideoDuration, cleanupTempFile } from './ffmpeg-service'
import { getSubtitleCacheDir } from './subtitle-config'
import log from '../../utils/log'

/** whisper.cpp 二进制名称（新版为 whisper-cli，旧版为 main） */
const WHISPER_BIN_NAMES = process.platform === 'win32'
    ? ['whisper-cli.exe', 'main.exe']
    : ['whisper-cli', 'main']

/**
 * 获取 whisper.cpp 二进制路径
 * 搜索顺序：
 * 1. 自动下载位置 (userData/binaries/whisper/)
 * 2. extraResources 捆绑路径 (process.resourcesPath)
 * 3. 项目根目录 resources/whisper/ (开发环境)
 * 4. app 根目录下的 whisper/
 * 5. 系统 PATH 中的 whisper
 */
function getWhisperBinPath(): string {
    for (const binName of WHISPER_BIN_NAMES) {
        const possiblePaths = [
            // 自动下载位置（优先）
            path.join(app.getPath('userData'), 'binaries', 'whisper', binName),
            // 生产环境：extraResources
            path.join(process.resourcesPath, 'whisper', binName),
            // 开发环境：项目根目录
            path.join(app.getAppPath(), 'resources', 'whisper', binName),
            // 开发环境：相对于 main 入口
            path.join(__dirname, '../../resources/whisper', binName),
            // userData 目录（用户手动放置）
            path.join(app.getPath('userData'), 'whisper', binName),
        ]

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                log.info(`[WhisperService] 找到 whisper.cpp: ${p}`)
                return p
            }
        }
    }

    // 回退到系统 PATH
    return WHISPER_BIN_NAMES[0]
}

/**
 * 检查 whisper.cpp 是否可用
 */
export function isWhisperAvailable(): { available: boolean; path: string } {
    const binPath = getWhisperBinPath()
    const available = fs.existsSync(binPath)
    return { available, path: binPath }
}


/** 根据视频路径生成缓存 key */
function getCacheKey(videoPath: string): string {
    const stat = fs.statSync(videoPath)
    const raw = `${videoPath}|${stat.size}|${stat.mtimeMs}`
    return crypto.createHash('md5').update(raw, 'utf-8').digest('hex')
}

/** 语言代码映射 */
function getLanguageCode(lang: SubtitleLanguage): string {
    const map: Record<string, string> = {
        auto: '',
        ja: 'ja',
        zh: 'zh',
        en: 'en',
        ko: 'ko'
    }
    return map[lang] || ''
}

/** 当前活跃的 whisper 进程 */
let activeProcess: ChildProcess | null = null

/** 是否正在生成 */
let isGenerating = false

/** 取消标志 */
let cancelRequested = false

/**
 * 检查字幕缓存
 */
export function checkSubtitleCache(videoPath: string): {
    cached: boolean
    subtitlePath?: string
} {
    const cacheKey = getCacheKey(videoPath)
    const cacheDir = getSubtitleCacheDir()
    const vttPath = path.join(cacheDir, `${cacheKey}.vtt`)
    const metaPath = path.join(cacheDir, `${cacheKey}.json`)

    if (fs.existsSync(vttPath) && fs.existsSync(metaPath)) {
        return {
            cached: true,
            subtitlePath: vttPath
        }
    }

    return { cached: false }
}

/**
 * 渐进式生成字幕
 * 边生成边推送已完成的段落，实现零延迟体验
 */
export async function generateSubtitleProgressive(
    videoPath: string,
    mainWindow: BrowserWindow,
    options: {
        language: SubtitleLanguage
        model: WhisperModelName
        useGpu: boolean
        force?: boolean
    }
): Promise<string> {
    // 检查是否已在生成
    if (isGenerating) {
        throw new Error('已有字幕生成任务正在运行')
    }

    // 检查 whisper.cpp 是否可用
    const whisperCheck = isWhisperAvailable()
    if (!whisperCheck.available) {
        throw new Error(
            `未找到 whisper.cpp 二进制文件。请在设置中点击"自动下载"，或手动将 whisper-cli.exe 放置到以下任一位置：\n` +
            `1. resources/whisper/whisper-cli.exe（项目根目录）\n` +
            `2. ${app.getPath('userData')}/whisper/whisper-cli.exe\n` +
            `下载地址：https://github.com/ggml-org/whisper.cpp/releases`
        )
    }

    // 检查模型
    if (!isModelDownloaded(options.model)) {
        throw new Error(`模型 ${options.model} 尚未下载，请先在设置中下载模型`)
    }

    // 检查缓存
    if (!options.force) {
        const cache = checkSubtitleCache(videoPath)
        if (cache.cached && cache.subtitlePath) {
            log.info(`[WhisperService] 使用缓存字幕: ${cache.subtitlePath}`)
            return cache.subtitlePath
        }
    }

    isGenerating = true
    cancelRequested = false

    const cacheKey = getCacheKey(videoPath)
    const cacheDir = getSubtitleCacheDir()
    const vttPath = path.join(cacheDir, `${cacheKey}.vtt`)
    const metaPath = path.join(cacheDir, `${cacheKey}.json`)

    let audioPath: string | null = null

    try {
        // 1. 提取音频
        log.info(`[WhisperService] 开始提取音频: ${videoPath}`)
        audioPath = await extractAudioFromVideo(videoPath)

        if (cancelRequested) {
            throw new Error('生成已取消')
        }

        // 2. 获取视频时长
        const duration = await getVideoDuration(videoPath)

        // 3. 运行 whisper.cpp
        const whisperBin = getWhisperBinPath()
        const modelPath = getModelPath(options.model)
        const langCode = getLanguageCode(options.language)

        const args = [
            '-m', modelPath,
            '-f', audioPath,
            '-ovtt',               // 输出 VTT 格式
            '-ml', '42',           // 每行最大字符数（适合字幕显示）
        ]

        if (langCode) {
            args.push('-l', langCode)
        }

        // 注意：--use-gpu 仅在 cublas 版本中可用，基础版不支持
        // 暂时不传递 GPU 参数，避免基础版报错退出

        // 输出到临时文件（whisper.cpp 会自动添加 .vtt 后缀）
        const tempOutputBase = vttPath.replace(/\.vtt$/, '.tmp')
        const tempVttPath = tempOutputBase + '.vtt'
        args.push('-of', tempOutputBase)

        log.info(`[WhisperService] 启动 whisper.cpp`, {
            bin: whisperBin,
            args: args.join(' '),
            model: options.model,
            language: options.language,
            useGpu: options.useGpu,
            duration: `${duration.toFixed(1)}s`
        })

        // 通知渲染进程开始生成
        mainWindow.webContents.send('subtitle:generate-progress', {
            processedDuration: 0,
            totalDuration: duration,
            percent: 0
        } as GenerateProgress)

        const result = await runWhisperProcess(whisperBin, args, duration, mainWindow)

        if (cancelRequested) {
            throw new Error('生成已取消')
        }

        // 4. 重命名临时文件为最终文件
        // whisper.cpp 使用 --output-vtt 时，-of 指定基础路径，会自动添加 .vtt 后缀
        if (fs.existsSync(tempVttPath)) {
            fs.renameSync(tempVttPath, vttPath)
        } else {
            log.warn(`[WhisperService] 临时 VTT 文件不存在: ${tempVttPath}，检查目录内容`)
            // 列出缓存目录中的文件以便调试
            const cacheDir = getSubtitleCacheDir()
            if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir)
                log.info(`[WhisperService] 缓存目录文件: ${files.join(', ')}`)
            }
        }

        // 5. 保存元数据
        const meta = {
            videoPath,
            model: options.model,
            language: options.language,
            generateTime: Date.now(),
            duration
        }
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')

        log.info(`[WhisperService] 字幕生成完成: ${vttPath}`, {
            segments: result.segments.length,
            time: `${((Date.now() - result.startTime) / 1000).toFixed(1)}s`
        })

        return vttPath
    } finally {
        isGenerating = false
        activeProcess = null

        // 清理临时音频文件
        if (audioPath) {
            cleanupTempFile(audioPath)
        }
    }
}

/**
 * 运行 whisper 进程并解析输出
 */
function runWhisperProcess(
    binPath: string,
    args: string[],
    totalDuration: number,
    mainWindow: BrowserWindow
): Promise<{ segments: SubtitleSegment[]; startTime: number }> {
    const startTime = Date.now()
    const segments: SubtitleSegment[] = []

    return new Promise((resolve, reject) => {
        const child = spawn(binPath, args)
        activeProcess = child

        let stdoutOutput = ''
        let stderrOutput = ''

        child.stdout.on('data', (data: Buffer) => {
            const text = data.toString()
            stdoutOutput += text
            parseProgress(text, totalDuration, mainWindow)
        })

        child.stderr.on('data', (data: Buffer) => {
            const text = data.toString()
            stderrOutput += text
            parseProgress(text, totalDuration, mainWindow)
        })

        child.on('close', (code) => {
            // 无论退出码是什么，都记录输出用于诊断
            if (stdoutOutput.trim()) {
                log.info(`[WhisperService] stdout: ${stdoutOutput.substring(0, 3000)}`)
            }
            if (stderrOutput.trim()) {
                log.info(`[WhisperService] stderr: ${stderrOutput.substring(0, 3000)}`)
            }

            if (code === 0) {
                resolve({ segments, startTime })
            } else if (cancelRequested) {
                reject(new Error('生成已取消'))
            } else {
                log.error(`[WhisperService] whisper.cpp 退出码: ${code}`)
                log.error(`[WhisperService] stdout: ${stdoutOutput.substring(0, 2000)}`)
                log.error(`[WhisperService] stderr: ${stderrOutput.substring(0, 2000)}`)
                reject(new Error(`whisper.cpp 执行失败 (退出码: ${code})`))
            }
        })

        child.on('error', (err) => {
            log.error(`[WhisperService] whisper.cpp 启动失败: ${err.message}`)
            reject(new Error(`whisper.cpp 启动失败: ${err.message}`))
        })
    })
}

/**
 * 解析 whisper.cpp 的进度输出
 * whisper.cpp 输出格式示例：
 * [00:00:00.000 --> 00:00:05.000]  こんにちは
 * 或者进度百分比
 */
function parseProgress(
    text: string,
    totalDuration: number,
    mainWindow: BrowserWindow
): void {
    // 尝试解析时间戳格式的进度
    // whisper.cpp 输出如: "### 00:00:05.000-00:00:10.000"
    const timeMatch = text.match(/(\d+):(\d+):(\d+\.\d+)\s*-\s*(\d+):(\d+):(\d+\.\d+)/)
    if (timeMatch) {
        const endTime = parseInt(timeMatch[4], 10) * 3600 +
            parseInt(timeMatch[5], 10) * 60 +
            parseFloat(timeMatch[6])

        const percent = totalDuration > 0 ? Math.min(Math.round((endTime / totalDuration) * 100), 100) : 0

        mainWindow.webContents.send('subtitle:generate-progress', {
            processedDuration: endTime,
            totalDuration,
            percent
        } as GenerateProgress)
    }

    // 解析文本段落（用于预览）
    const segmentMatch = text.match(/\[(\d+:\d+:\d+\.\d+)\s*-->\s*(\d+:\d+:\d+\.\d+)\]\s*(.+)/)
    if (segmentMatch) {
        const currentText = segmentMatch[3]?.trim()
        if (currentText) {
            mainWindow.webContents.send('subtitle:generate-progress', {
                processedDuration: 0,
                totalDuration,
                percent: 0,
                currentText
            } as GenerateProgress)
        }
    }
}

/**
 * 取消当前生成任务
 */
export function cancelGeneration(): void {
    cancelRequested = true
    if (activeProcess && !activeProcess.killed) {
        activeProcess.kill('SIGTERM')
        log.info('[WhisperService] 已取消生成任务')
    }
}

/**
 * 实时转录音频片段
 * 用于 seek 到未生成区域时的降级处理
 */
export async function transcribeAudioChunk(
    audioPath: string,
    options: {
        language: SubtitleLanguage
        model: WhisperModelName
        useGpu: boolean
    }
): Promise<string> {
    if (!isModelDownloaded(options.model)) {
        throw new Error(`模型 ${options.model} 尚未下载`)
    }

    const whisperBin = getWhisperBinPath()
    const modelPath = getModelPath(options.model)
    const langCode = getLanguageCode(options.language)

    const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-nt',                 // 不输出时间戳
    ]

    if (langCode) {
        args.push('-l', langCode)
    }

    // 注意：--use-gpu 仅在 cublas 版本中可用

    return new Promise((resolve, reject) => {
        const child = spawn(whisperBin, args)

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
        })

        child.on('close', (code) => {
            if (code === 0) {
                // 清理输出，只保留文本
                const text = stdout
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('[') && !line.startsWith('#'))
                    .join(' ')
                    .trim()
                resolve(text)
            } else {
                reject(new Error(`whisper.cpp 转录失败 (退出码: ${code})`))
            }
        })

        child.on('error', (err) => {
            reject(new Error(`whisper.cpp 启动失败: ${err.message}`))
        })
    })
}

/**
 * 读取 VTT 字幕文件并解析为段落列表
 */
export function parseVttFile(vttPath: string): SubtitleSegment[] {
    if (!fs.existsSync(vttPath)) {
        return []
    }

    // 读取文件并统一换行符为 \n（whisper.cpp 在 Windows 上输出 \r\n）
    const content = fs.readFileSync(vttPath, 'utf-8').replace(/\r\n/g, '\n')
    const segments: SubtitleSegment[] = []

    // 解析 WebVTT 格式
    const blocks = content.split('\n\n')
    let id = 0

    for (const block of blocks) {
        const lines = block.trim().split('\n')
        // 查找时间行
        const timeLineIndex = lines.findIndex(line =>
            /^\d+:\d+:\d+\.\d+\s*-->\s*\d+:\d+:\d+\.\d+/.test(line) ||
            /^\d+:\d+\.\d+\s*-->\s*\d+:\d+\:\d+\.\d+/.test(line)
        )

        if (timeLineIndex >= 0) {
            const timeLine = lines[timeLineIndex]
            const timeMatch = timeLine.match(
                /(\d+):(\d+):?(\d+\.\d+)?\s*-->\s*(\d+):(\d+):?(\d+\.\d+)?/
            )

            if (timeMatch) {
                const startTime = parseTimeString(timeMatch[1], timeMatch[2], timeMatch[3])
                const endTime = parseTimeString(timeMatch[4], timeMatch[5], timeMatch[6])
                const text = lines.slice(timeLineIndex + 1).join('\n').trim()

                if (text) {
                    segments.push({
                        id: id++,
                        startTime,
                        endTime,
                        text
                    })
                }
            }
        }
    }

    return segments
}

/** 解析时间字符串为秒 */
function parseTimeString(h: string, m: string, s?: string): number {
    const hours = parseInt(h, 10) || 0
    const minutes = parseInt(m, 10) || 0
    const seconds = parseFloat(s || '0') || 0
    return hours * 3600 + minutes * 60 + seconds
}

/**
 * 获取当前生成状态
 */
export function getGenerationStatus(): { isGenerating: boolean } {
    return { isGenerating }
}

/**
 * 清理所有字幕缓存
 */
export function clearSubtitleCache(): void {
    const cacheDir = getSubtitleCacheDir()
    if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir)
        for (const file of files) {
            fs.unlinkSync(path.join(cacheDir, file))
        }
    }
    log.info('[WhisperService] 字幕缓存已清理')
}

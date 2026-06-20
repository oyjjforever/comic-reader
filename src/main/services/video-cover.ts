/**
 * 视频封面缓存服务
 * 负责视频封面图的生成、缓存与读取
 * 封面文件保存在应用安装路径（userData）下
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { getFfmpegPath } from './ffmpeg-service'
import log from '../../utils/log'

const COVER_DIR_NAME = 'video-covers'

/**
 * 获取封面缓存目录
 */
export function getCoverDir(): string {
  return path.join(app.getPath('userData'), COVER_DIR_NAME)
}

/**
 * 确保封面目录存在
 */
function ensureCoverDir(): string {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 根据视频路径生成稳定的封面文件名（哈希）
 */
function getCoverFileName(videoPath: string): string {
  return crypto.createHash('md5').update(videoPath).digest('hex') + '.jpg'
}

/**
 * 获取某个视频的封面缓存路径（不检查是否存在）
 */
export function getCoverPath(videoPath: string): string {
  return path.join(getCoverDir(), getCoverFileName(videoPath))
}

/**
 * 检查封面缓存是否存在
 */
export function hasCover(videoPath: string): boolean {
  const coverPath = getCoverPath(videoPath)
  return fs.existsSync(coverPath)
}

/**
 * 获取封面缓存路径，不存在则返回 null
 */
export function getCoverPathIfExists(videoPath: string): string | null {
  const coverPath = getCoverPath(videoPath)
  return fs.existsSync(coverPath) ? coverPath : null
}

/**
 * 将 Buffer 写入封面缓存
 * @returns 封面文件路径
 */
export function saveCoverFromBuffer(videoPath: string, buffer: Buffer): string {
  const dir = ensureCoverDir()
  const coverPath = path.join(dir, getCoverFileName(videoPath))
  fs.writeFileSync(coverPath, buffer)
  log.info(`[VideoCover] 封面已保存: ${coverPath}`)
  return coverPath
}

/**
 * 将 base64 data URL 写入封面缓存
 * @param dataUrl 形如 data:image/jpeg;base64,xxxx
 * @returns 封面文件路径
 */
export function saveCoverFromDataUrl(videoPath: string, dataUrl: string): string {
  const base64Match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!base64Match) {
    throw new Error('无效的图片 data URL')
  }
  const buffer = Buffer.from(base64Match[1], 'base64')
  return saveCoverFromBuffer(videoPath, buffer)
}

/**
 * 删除封面缓存
 */
export function deleteCover(videoPath: string): boolean {
  const coverPath = getCoverPath(videoPath)
  try {
    if (fs.existsSync(coverPath)) {
      fs.unlinkSync(coverPath)
      log.info(`[VideoCover] 封面已删除: ${coverPath}`)
      return true
    }
    return false
  } catch (err: any) {
    log.error(`[VideoCover] 删除封面失败: ${err?.message}`)
    return false
  }
}

/**
 * 使用 FFmpeg 从视频中提取指定时间点的帧作为封面
 * @param videoPath 视频文件路径
 * @param timeOffset 截取的时间点（秒），默认 5 秒
 * @returns 封面文件路径，失败抛出异常
 */
export async function generateCover(
  videoPath: string,
  timeOffset: number = 5
): Promise<string> {
  const dir = ensureCoverDir()
  const coverPath = path.join(dir, getCoverFileName(videoPath))
  const ffmpegPath = getFfmpegPath()

  log.info(`[VideoCover] 生成封面: ${videoPath} @ ${timeOffset}s -> ${coverPath}`)

  return new Promise((resolve, reject) => {
    const args = [
      '-ss', timeOffset.toString(),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-y',
      coverPath
    ]

    const child = spawn(ffmpegPath, args)

    let stderrOutput = ''
    child.stderr.on('data', (data: Buffer) => {
      stderrOutput += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(coverPath)) {
        log.info(`[VideoCover] 封面生成完成: ${coverPath}`)
        resolve(coverPath)
      } else {
        log.error(`[VideoCover] 封面生成失败，退出码: ${code}`, { stderr: stderrOutput })
        reject(new Error(`FFmpeg 封面生成失败 (退出码: ${code})`))
      }
    })

    child.on('error', (err) => {
      log.error(`[VideoCover] FFmpeg 启动失败: ${err.message}`)
      reject(new Error(`FFmpeg 启动失败: ${err.message}`))
    })
  })
}

/**
 * 清空所有封面缓存
 */
export function clearAllCovers(): number {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) return 0
  let count = 0
  for (const file of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, file))
      count++
    } catch {
      // 忽略单个文件删除失败
    }
  }
  log.info(`[VideoCover] 已清空 ${count} 个封面缓存`)
  return count
}

/**
 * 获取封面缓存目录占用空间
 */
export function getCoverDirSize(): number {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) return 0
  let total = 0
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current)) {
      const full = path.join(current, entry)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else {
        total += stat.size
      }
    }
  }
  try {
    walk(dir)
  } catch {
    // ignore
  }
  return total
}

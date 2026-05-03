/**
 * FFmpeg 服务
 * 负责从视频中提取音频
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { getTempDir } from './subtitle-config'
import log from '../../utils/log'

/** FFmpeg 二进制名称 */
const FFMPEG_BIN_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

/**
 * 获取 FFmpeg 二进制路径
 * 搜索顺序与 whisper.cpp 相同
 */
export function getFfmpegPath(): string {
    const { app } = require('electron')
    const possiblePaths = [
        // 自动下载位置（优先）
        path.join(app.getPath('userData'), 'binaries', 'ffmpeg', FFMPEG_BIN_NAME),
        // 生产环境：extraResources
        path.join(process.resourcesPath, 'ffmpeg', FFMPEG_BIN_NAME),
        // 开发环境：项目根目录
        path.join(app.getAppPath(), 'resources', 'ffmpeg', FFMPEG_BIN_NAME),
        // 开发环境：相对于 main 入口
        path.join(__dirname, '../../resources/ffmpeg', FFMPEG_BIN_NAME),
        // userData 目录
        path.join(app.getPath('userData'), 'ffmpeg', FFMPEG_BIN_NAME),
    ]

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p
        }
    }

    // 回退到系统 PATH
    return FFMPEG_BIN_NAME
}


/**
 * 从视频中提取完整音频为 16kHz 单声道 WAV
 * @param videoPath 视频文件路径
 * @returns WAV 音频文件路径
 */
export async function extractAudioFromVideo(videoPath: string): Promise<string> {
    const ffmpegPath = getFfmpegPath()
    const tempDir = getTempDir()

    // 生成唯一的临时文件名
    const tempFileName = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`
    const outputPath = path.join(tempDir, tempFileName)

    log.info(`[FFmpegService] 提取音频: ${videoPath} -> ${outputPath}`)

    return new Promise((resolve, reject) => {
        const args = [
            '-i', videoPath,
            '-ar', '16000',       // 采样率 16kHz
            '-ac', '1',           // 单声道
            '-c:a', 'pcm_s16le',  // 16-bit PCM
            '-y',                 // 覆盖输出
            outputPath
        ]

        const child = spawn(ffmpegPath, args)

        let stderrOutput = ''
        child.stderr.on('data', (data: Buffer) => {
            stderrOutput += data.toString()
        })

        child.on('close', (code) => {
            if (code === 0) {
                log.info(`[FFmpegService] 音频提取完成: ${outputPath}`)
                resolve(outputPath)
            } else {
                log.error(`[FFmpegService] 音频提取失败，退出码: ${code}`, { stderr: stderrOutput })
                reject(new Error(`FFmpeg 音频提取失败 (退出码: ${code})`))
            }
        })

        child.on('error', (err) => {
            log.error(`[FFmpegService] FFmpeg 启动失败: ${err.message}`)
            reject(new Error(`FFmpeg 启动失败: ${err.message}`))
        })
    })
}

/**
 * 从视频中提取指定时间段的音频
 * @param videoPath 视频文件路径
 * @param startTime 开始时间（秒）
 * @param duration 持续时间（秒）
 * @returns WAV 音频文件路径
 */
export async function extractAudioSegment(
    videoPath: string,
    startTime: number,
    duration: number
): Promise<string> {
    const ffmpegPath = getFfmpegPath()
    const tempDir = getTempDir()

    const tempFileName = `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`
    const outputPath = path.join(tempDir, tempFileName)

    log.info(`[FFmpegService] 提取音频片段: ${startTime}s +${duration}s`)

    return new Promise((resolve, reject) => {
        const args = [
            '-i', videoPath,
            '-ss', startTime.toString(),
            '-t', duration.toString(),
            '-ar', '16000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            '-y',
            outputPath
        ]

        const child = spawn(ffmpegPath, args)

        let stderrOutput = ''
        child.stderr.on('data', (data: Buffer) => {
            stderrOutput += data.toString()
        })

        child.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath)
            } else {
                reject(new Error(`FFmpeg 音频片段提取失败 (退出码: ${code})`))
            }
        })

        child.on('error', (err) => {
            reject(new Error(`FFmpeg 启动失败: ${err.message}`))
        })
    })
}

/**
 * 获取视频时长（秒）
 * 优先使用 ffprobe，失败则回退到 ffmpeg stderr 解析
 * @param videoPath 视频文件路径
 * @returns 时长（秒）
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
    const ffmpegPath = getFfmpegPath()

    // 构造 ffprobe 路径
    const ffprobePath = ffmpegPath.replace('ffmpeg.exe', 'ffprobe.exe').replace('ffmpeg', 'ffprobe')

    // 先尝试 ffprobe
    try {
        const duration = await getDurationViaFfprobe(ffprobePath, videoPath)
        if (duration > 0) return duration
    } catch {
        // ffprobe 不可用，忽略错误
    }

    // 回退：使用 ffmpeg stderr 解析时长
    return getDurationViaFfmpeg(ffmpegPath, videoPath)
}

/** 使用 ffprobe 获取时长 */
function getDurationViaFfprobe(ffprobePath: string, videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', videoPath,
            '-show_entries', 'format=duration',
            '-v', 'quiet',
            '-of', 'csv=p=0'
        ]

        const child = spawn(ffprobePath, args)
        let stdoutOutput = ''

        child.stdout.on('data', (data: Buffer) => {
            stdoutOutput += data.toString()
        })

        child.on('close', (code) => {
            if (code === 0 && stdoutOutput.trim()) {
                const duration = parseFloat(stdoutOutput.trim())
                if (!isNaN(duration) && duration > 0) {
                    resolve(duration)
                    return
                }
            }
            reject(new Error('ffprobe 无法获取时长'))
        })

        child.on('error', (err) => {
            reject(new Error(`ffprobe 不可用: ${err.message}`))
        })
    })
}

/** 使用 ffmpeg stderr 解析获取时长 */
function getDurationViaFfmpeg(ffmpegPath: string, videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, ['-i', videoPath])
        let stderrOutput = ''

        child.stderr.on('data', (data: Buffer) => {
            stderrOutput += data.toString()
        })

        child.on('close', () => {
            const durationMatch = stderrOutput.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
            if (durationMatch) {
                const hours = parseInt(durationMatch[1], 10)
                const minutes = parseInt(durationMatch[2], 10)
                const seconds = parseFloat(durationMatch[3])
                resolve(hours * 3600 + minutes * 60 + seconds)
                return
            }
            log.error('[FFmpegService] 无法从 ffmpeg 输出解析时长', { stderr: stderrOutput })
            reject(new Error('无法获取视频时长'))
        })

        child.on('error', (err) => {
            reject(new Error(`FFmpeg 启动失败: ${err.message}`))
        })
    })
}

/** 清理临时音频文件 */
export function cleanupTempFile(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
    } catch {
        // 忽略清理错误
    }
}

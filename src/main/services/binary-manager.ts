/**
 * 二进制文件管理器
 * 自动下载 whisper.cpp 和 FFmpeg 二进制文件
 */
import { app, BrowserWindow, net } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import log from '../../utils/log'

/** whisper.cpp 下载信息（CUDA 12.4 GPU 加速版本） */
const WHISPER_RELEASE = {
    version: '1.8.4',
    // Windows x64 CUDA 12.4 版本（GPU 加速）
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip',
    binName: process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli',
    zipDir: 'bin-x64'
}

/** FFmpeg 下载信息（使用 BtbQ 的静态构建） */
const FFMPEG_RELEASE = {
    // 使用 gyan.dev 的 essentials 构建（更小，包含 ffmpeg.exe）
    url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    binName: process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

/** 二进制文件存储目录 */
function getBinariesDir(): string {
    const dir = path.join(app.getPath('userData'), 'binaries')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/** 检查 whisper.cpp 是否已安装 */
export function isWhisperInstalled(): boolean {
    const binPath = path.join(getBinariesDir(), 'whisper', WHISPER_RELEASE.binName)
    return fs.existsSync(binPath)
}

/** 检查 FFmpeg 是否已安装 */
export function isFfmpegInstalled(): boolean {
    const binPath = path.join(getBinariesDir(), 'ffmpeg', FFMPEG_RELEASE.binName)
    return fs.existsSync(binPath)
}

/** 获取二进制文件状态 */
export function getBinaryStatus(): {
    whisperInstalled: boolean
    ffmpegInstalled: boolean
    whisperPath: string
    ffmpegPath: string
} {
    const binariesDir = getBinariesDir()
    return {
        whisperInstalled: isWhisperInstalled(),
        ffmpegInstalled: isFfmpegInstalled(),
        whisperPath: path.join(binariesDir, 'whisper', WHISPER_RELEASE.binName),
        ffmpegPath: path.join(binariesDir, 'ffmpeg', FFMPEG_RELEASE.binName)
    }
}

/**
 * 下载文件到指定路径
 */
function downloadFile(
    url: string,
    destPath: string,
    onProgress: (percent: number) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = net.request(url)
        let totalBytes = 0
        let receivedBytes = 0

        request.on('response', (response) => {
            // 处理重定向
            const statusCode = response.statusCode
            if (statusCode >= 300 && statusCode < 400) {
                const location = response.headers['location']
                if (location) {
                    const redirectUrl = Array.isArray(location) ? location[0] : location
                    log.info(`[BinaryManager] 重定向到: ${redirectUrl}`)
                    downloadFile(redirectUrl, destPath, onProgress)
                        .then(resolve)
                        .catch(reject)
                    return
                }
            }

            if (statusCode !== 200) {
                reject(new Error(`下载失败，HTTP 状态码: ${statusCode}`))
                return
            }

            const contentLength = response.headers['content-length']
            if (contentLength) {
                totalBytes = parseInt(
                    Array.isArray(contentLength) ? contentLength[0] : contentLength,
                    10
                )
            }

            const fileStream = fs.createWriteStream(destPath)

            fileStream.on('error', (err) => {
                fileStream.destroy()
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath)
                }
                reject(new Error(`文件写入失败: ${err.message}`))
            })

            response.on('data', (chunk: Buffer) => {
                receivedBytes += chunk.length
                fileStream.write(chunk)
                if (totalBytes > 0) {
                    onProgress(Math.round((receivedBytes / totalBytes) * 100))
                }
            })

            response.on('end', () => {
                fileStream.end()
                resolve()
            })

            response.on('error', (err: any) => {
                fileStream.destroy()
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath)
                }
                reject(new Error(`下载响应错误: ${err.message}`))
            })
        })

        request.on('error', (err) => {
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath)
            }
            reject(new Error(`下载请求失败: ${err.message}`))
        })

        request.end()
    })
}

/**
 * 解压 ZIP 文件
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
    // 确保目标目录存在
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
    }

    // 尝试使用 7zip
    const sevenZipPaths = [
        'C:\\Program Files\\7-Zip\\7z.exe',
        'C:\\Program Files (x86)\\7-Zip\\7z.exe',
        process.env['ProgramFiles'] + '\\7-Zip\\7z.exe',
        process.env['ProgramFiles(x86)'] + '\\7-Zip\\7z.exe'
    ]

    for (const p of sevenZipPaths) {
        if (fs.existsSync(p)) {
            return new Promise((resolve, reject) => {
                const child = spawn(p, ['x', zipPath, `-o${destDir}`, '-y'])
                child.on('close', (code) => {
                    if (code === 0) resolve()
                    else reject(new Error(`7zip 解压失败，退出码: ${code}`))
                })
                child.on('error', (err) => {
                    reject(new Error(`7zip 错误: ${err.message}`))
                })
            })
        }
    }

    // 使用 Node.js 的 zip-lib
    try {
        const { extract } = require('zip-lib')
        await extract(zipPath, destDir)
    } catch {
        throw new Error('解压失败：未找到 7-Zip，请安装 7-Zip 或手动解压')
    }
}

/**
 * 下载并安装 whisper.cpp
 */
export async function downloadWhisper(
    mainWindow: BrowserWindow
): Promise<void> {
    const binariesDir = getBinariesDir()
    const tempZip = path.join(binariesDir, 'whisper-download.zip')
    const whisperDir = path.join(binariesDir, 'whisper')

    log.info('[BinaryManager] 开始下载 whisper.cpp')

    try {
        // 下载
        await downloadFile(WHISPER_RELEASE.url, tempZip, (percent) => {
            mainWindow.webContents.send('subtitle:binary-download-progress', {
                binary: 'whisper',
                percent,
                status: 'downloading'
            })
        })

        mainWindow.webContents.send('subtitle:binary-download-progress', {
            binary: 'whisper',
            percent: 100,
            status: 'extracting'
        })

        // 解压
        const extractDir = path.join(binariesDir, 'whisper-extract')
        await extractZip(tempZip, extractDir)

        // 查找 main.exe 并复制到目标位置
        if (!fs.existsSync(whisperDir)) {
            fs.mkdirSync(whisperDir, { recursive: true })
        }

        // 在解压目录中查找 main.exe
        const mainExe = findFile(extractDir, WHISPER_RELEASE.binName)
        if (!mainExe) {
            throw new Error(`解压后未找到 ${WHISPER_RELEASE.binName}`)
        }

        const destBin = path.join(whisperDir, WHISPER_RELEASE.binName)
        fs.copyFileSync(mainExe, destBin)

        // 同时复制 ggml.dll 等依赖（如果存在）
        const dllFiles = findFiles(extractDir, /\.dll$/)
        for (const dll of dllFiles) {
            const dllName = path.basename(dll)
            fs.copyFileSync(dll, path.join(whisperDir, dllName))
        }

        // 清理
        cleanupPath(tempZip)
        cleanupPath(extractDir)

        log.info(`[BinaryManager] whisper.cpp 安装完成: ${destBin}`)

        mainWindow.webContents.send('subtitle:binary-download-progress', {
            binary: 'whisper',
            percent: 100,
            status: 'done'
        })
    } catch (err: any) {
        log.error(`[BinaryManager] whisper.cpp 下载失败: ${err.message}`)
        // 清理临时文件
        cleanupPath(tempZip)
        throw err
    }
}

/**
 * 下载并安装 FFmpeg
 */
export async function downloadFfmpeg(
    mainWindow: BrowserWindow
): Promise<void> {
    const binariesDir = getBinariesDir()
    const tempZip = path.join(binariesDir, 'ffmpeg-download.zip')
    const ffmpegDir = path.join(binariesDir, 'ffmpeg')

    log.info('[BinaryManager] 开始下载 FFmpeg')

    try {
        // 下载
        await downloadFile(FFMPEG_RELEASE.url, tempZip, (percent) => {
            mainWindow.webContents.send('subtitle:binary-download-progress', {
                binary: 'ffmpeg',
                percent,
                status: 'downloading'
            })
        })

        mainWindow.webContents.send('subtitle:binary-download-progress', {
            binary: 'ffmpeg',
            percent: 100,
            status: 'extracting'
        })

        // 解压
        const extractDir = path.join(binariesDir, 'ffmpeg-extract')
        await extractZip(tempZip, extractDir)

        // 查找 ffmpeg.exe 并复制到目标位置
        if (!fs.existsSync(ffmpegDir)) {
            fs.mkdirSync(ffmpegDir, { recursive: true })
        }

        const ffmpegExe = findFile(extractDir, FFMPEG_RELEASE.binName)
        if (!ffmpegExe) {
            throw new Error(`解压后未找到 ${FFMPEG_RELEASE.binName}`)
        }

        const destBin = path.join(ffmpegDir, FFMPEG_RELEASE.binName)
        fs.copyFileSync(ffmpegExe, destBin)

        // 同时复制 ffprobe.exe（用于获取视频信息）
        const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
        const ffprobeExe = findFile(extractDir, ffprobeName)
        if (ffprobeExe) {
            fs.copyFileSync(ffprobeExe, path.join(ffmpegDir, ffprobeName))
        }

        // 清理
        cleanupPath(tempZip)
        cleanupPath(extractDir)

        log.info(`[BinaryManager] FFmpeg 安装完成: ${destBin}`)

        mainWindow.webContents.send('subtitle:binary-download-progress', {
            binary: 'ffmpeg',
            percent: 100,
            status: 'done'
        })
    } catch (err: any) {
        log.error(`[BinaryManager] FFmpeg 下载失败: ${err.message}`)
        cleanupPath(tempZip)
        throw err
    }
}

/** 递归查找文件 */
function findFile(dir: string, fileName: string): string | null {
    if (!fs.existsSync(dir)) return null

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            const result = findFile(fullPath, fileName)
            if (result) return result
        } else if (entry.name === fileName) {
            return fullPath
        }
    }
    return null
}

/** 递归查找匹配的文件 */
function findFiles(dir: string, pattern: RegExp): string[] {
    if (!fs.existsSync(dir)) return []

    const results: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(...findFiles(fullPath, pattern))
        } else if (pattern.test(entry.name)) {
            results.push(fullPath)
        }
    }
    return results
}

/** 清理路径（文件或目录） */
function cleanupPath(targetPath: string): void {
    try {
        if (!fs.existsSync(targetPath)) return
        const stat = fs.statSync(targetPath)
        if (stat.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true })
        } else {
            fs.unlinkSync(targetPath)
        }
    } catch {
        // 忽略清理错误
    }
}

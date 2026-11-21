import http from 'http'
import { URL } from 'url'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import log from '../../utils/log'
import { getCoverPathIfExists, generateCover } from '../../main/services/video-cover'
import { getVideoMetadata, VideoMetadata } from '../../main/services/ffmpeg-service'

/**
 * MIME 类型映射
 */
const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.m4v': 'video/mp4',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.pdf': 'application/pdf',
    '.epub': 'application/epub+zip',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.txt': 'text/plain'
}

/**
 * 获取文件的 MIME 类型
 */
function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * 处理文件请求（支持 Range Request 流式传输）
 * GET /api/file?path=D:/Comics/xxx/001.jpg
 * GET /api/thumbnail?path=D:/Comics/xxx/001.jpg&width=300
 */
export async function handleFileRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    isThumbnail: boolean = false
) {
    const filePath = url.searchParams.get('path')
    if (!filePath) {
        sendError(res, 400, 'Missing path parameter')
        return
    }

    // 安全检查：防止路径遍历攻击
    const normalizedPath = path.normalize(filePath)
    if (normalizedPath.includes('..')) {
        sendError(res, 403, 'Forbidden: path traversal detected')
        return
    }

    // 检查文件是否存在
    if (!fs.existsSync(normalizedPath)) {
        sendError(res, 404, `File not found: ${path.basename(normalizedPath)}`)
        return
    }

    try {
        const stat = await fsp.stat(normalizedPath)
        if (!stat.isFile()) {
            sendError(res, 400, 'Path is not a file')
            return
        }

        const mimeType = getMimeType(normalizedPath)
        const fileSize = stat.size

        // 如果是缩略图请求，处理图片缩略图
        if (isThumbnail) {
            await handleThumbnail(req, res, normalizedPath, mimeType, url)
            return
        }

        // 处理 Range Request（流式传输）
        const rangeHeader = req.headers.range

        if (rangeHeader) {
            // 解析 Range header: "bytes=start-end"
            const parts = rangeHeader.replace(/bytes=/, '').split('-')
            const start = parseInt(parts[0], 10)
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

            // 将 end 限制在文件大小范围内（HTTP 规范：超出范围应自动调整）
            if (end >= fileSize) {
                end = fileSize - 1
            }

            // 校验范围：仅当 start 超出文件大小时才返回 416
            if (start >= fileSize || start > end) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`
                })
                res.end()
                return
            }

            const chunkSize = end - start + 1

            res.writeHead(206, {
                'Content-Type': mimeType,
                'Content-Length': chunkSize,
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=86400', // 缓存24小时
                'Last-Modified': stat.mtime.toUTCString()
            })

            // 创建文件流并截取指定范围
            const fileStream = fs.createReadStream(normalizedPath, { start, end })
            fileStream.pipe(res)

            fileStream.on('error', (err) => {
                log.error(`[Server] File stream error: ${err.message}`)
                if (!res.headersSent) {
                    sendError(res, 500, 'File stream error')
                }
            })
        } else {
            // 无 Range header，返回完整文件
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': fileSize,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=86400',
                'Last-Modified': stat.mtime.toUTCString()
            })

            const fileStream = fs.createReadStream(normalizedPath)
            fileStream.pipe(res)

            fileStream.on('error', (err) => {
                log.error(`[Server] File stream error: ${err.message}`)
                if (!res.headersSent) {
                    sendError(res, 500, 'File stream error')
                }
            })
        }
    } catch (error: any) {
        log.error(`[Server] File serve error: ${error.message}`)
        sendError(res, 500, error.message || 'Internal Server Error')
    }
}

/**
 * 视频封面生成：并发限制 + 同一路径去重
 * 移动端网格首次加载会并发请求多个封面，避免瞬间 fork 大量 ffmpeg 进程
 */
const MAX_CONCURRENT_COVER_JOBS = 4
let activeCoverJobs = 0
const coverQueue: Array<() => void> = []
const generatingCovers = new Map<string, Promise<string>>()

async function withCoverSlot<T>(fn: () => Promise<T>): Promise<T> {
    while (activeCoverJobs >= MAX_CONCURRENT_COVER_JOBS) {
        await new Promise<void>(resolve => coverQueue.push(resolve))
    }
    activeCoverJobs++
    try {
        return await fn()
    } finally {
        activeCoverJobs--
        const next = coverQueue.shift()
        if (next) next()
    }
}

/**
 * 多格式查封面缓存
 * 桌面端历史缓存键混存多种分隔符格式（设置根路径为反斜杠、浏览产生的
 * 子路径可能为正斜杠，用户自定义帧可能挂在任一格式下），依次尝试。
 */
function getCoverPathIfExistsAny(videoPath: string): string | null {
    const candidates = new Set<string>([
        videoPath,
        path.normalize(videoPath),
        videoPath.replace(/\\/g, '/')
    ])
    for (const candidate of candidates) {
        const hit = getCoverPathIfExists(candidate)
        if (hit) return hit
    }
    return null
}

/**
 * 获取或生成视频封面路径（命中缓存直接返回）
 */
function getOrCreateCover(videoPath: string): Promise<string> {
    // 生成时统一用规范化路径作为缓存键，避免继续产生混合格式
    const normalizedKey = path.normalize(videoPath)
    const cached = getCoverPathIfExistsAny(normalizedKey)
    if (cached) return Promise.resolve(cached)

    const pending = generatingCovers.get(normalizedKey)
    if (pending) return pending

    const job = withCoverSlot(() => generateCover(normalizedKey)).finally(() => {
        generatingCovers.delete(normalizedKey)
    })
    generatingCovers.set(normalizedKey, job)
    return job
}

// 视频元数据内存缓存：videoPath -> {width, height, duration}（探测失败缓存 null）
const videoMetaCache = new Map<string, VideoMetadata | null>()

function getOrCreateVideoMeta(videoPath: string): Promise<VideoMetadata | null> {
    if (videoMetaCache.has(videoPath)) {
        return Promise.resolve(videoMetaCache.get(videoPath)!)
    }
    return getVideoMetadata(videoPath).then(meta => {
        videoMetaCache.set(videoPath, meta)
        return meta
    })
}

/**
 * 处理视频封面请求
 * GET /api/video-cover?path=D:/Videos/xxx.mp4
 * 复用 main/services/video-cover 的 ffmpeg 封面缓存：
 * 命中缓存直接流式返回 jpg，未命中生成后返回（供移动端零解码获取封面）
 */
export async function handleVideoCoverRequest(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
) {
    const videoPath = url.searchParams.get('path')
    if (!videoPath) {
        sendError(res, 400, 'Missing path parameter')
        return
    }

    // 安全检查：防止路径遍历攻击
    const normalizedPath = path.normalize(videoPath)
    if (normalizedPath.includes('..')) {
        sendError(res, 403, 'Forbidden: path traversal detected')
        return
    }

    if (!fs.existsSync(normalizedPath)) {
        sendError(res, 404, `File not found: ${path.basename(normalizedPath)}`)
        return
    }

    try {
        // 封面与元数据并行获取（元数据用于客户端显示 1080p · 时长）
        const [coverPath, meta] = await Promise.all([
            getOrCreateCover(normalizedPath),
            getOrCreateVideoMeta(normalizedPath)
        ])
        const stat = await fsp.stat(coverPath)

        const headers: Record<string, string | number> = {
            'Content-Type': 'image/jpeg',
            'Content-Length': stat.size,
            'Cache-Control': 'public, max-age=86400',
            'Last-Modified': stat.mtime.toUTCString()
        }
        if (meta) {
            headers['X-Video-Width'] = String(meta.width)
            headers['X-Video-Height'] = String(meta.height)
            headers['X-Video-Duration'] = String(meta.duration)
        }

        res.writeHead(200, headers)

        const fileStream = fs.createReadStream(coverPath)
        fileStream.pipe(res)

        fileStream.on('error', (err) => {
            log.error(`[Server] Video cover stream error: ${err.message}`)
            if (!res.headersSent) {
                sendError(res, 500, 'Video cover stream error')
            }
        })
    } catch (error: any) {
        log.error(`[Server] Video cover error: ${error.message}`)
        sendError(res, 500, 'Failed to generate video cover')
    }
}

/**
 * 处理缩略图请求
 * - 图片：直接返回原图（后续可用 Sharp 生成缩略图）
 * - 视频：客户端自行使用 video_thumbnail 等方式生成缩略图
 */
async function handleThumbnail(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    filePath: string,
    mimeType: string,
    url: URL
) {
    // 图片文件：直接返回原图
    const stat = await fsp.stat(filePath)

    res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
        'Last-Modified': stat.mtime.toUTCString()
    })

    const fileStream = fs.createReadStream(filePath)
    fileStream.pipe(res)

    fileStream.on('error', (err) => {
        log.error(`[Server] Thumbnail stream error: ${err.message}`)
        if (!res.headersSent) {
            sendError(res, 500, 'Thumbnail stream error')
        }
    })
}

function sendJson(res: http.ServerResponse, data: any, statusCode: number = 200) {
    const jsonStr = JSON.stringify(data)
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(jsonStr)
    })
    res.end(jsonStr)
}

function sendError(res: http.ServerResponse, statusCode: number, message: string) {
    sendJson(res, { error: message }, statusCode)
}

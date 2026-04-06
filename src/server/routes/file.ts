import http from 'http'
import { URL } from 'url'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import log from '../../utils/log'

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

        // 如果是缩略图请求，尝试生成缩略图
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
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

            // 校验范围
            if (start >= fileSize || end >= fileSize || start > end) {
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
 * 处理缩略图请求
 * 目前直接返回原图（后续可用 Sharp 生成缩略图）
 */
async function handleThumbnail(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    filePath: string,
    mimeType: string,
    url: URL
) {
    // TODO: 后续可使用 Sharp 生成缩略图
    // const width = parseInt(url.searchParams.get('width') || '300', 10)
    // 目前直接返回原图
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

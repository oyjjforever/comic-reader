import http from 'http'
import { URL } from 'url'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import fg from 'fast-glob'
import { corsMiddleware } from './middleware/cors'
import { handleBrowseRequest } from './routes/browse'
import { handleFileRequest } from './routes/file'
import { handleFavoritesRequest } from './routes/favorites'
import { handleHistoryRequest } from './routes/history'
import log from '../utils/log'

const DEFAULT_PORT = 9527

export class ComicReaderServer {
    private server: http.Server | null = null
    private port: number
    private resourcePath: string = ''
    private running: boolean = false

    constructor(port: number = DEFAULT_PORT) {
        this.port = port
    }

    /**
     * 设置资源根路径
     */
    setResourcePath(resourcePath: string) {
        this.resourcePath = resourcePath
    }

    /**
     * 启动 HTTP 服务器
     */
    start(): Promise<number> {
        return new Promise((resolve, reject) => {
            if (this.running) {
                resolve(this.port)
                return
            }

            this.server = http.createServer(async (req, res) => {
                await this.handleRequest(req, res)
            })

            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    log.warn(`[Server] Port ${this.port} is in use, trying ${this.port + 1}`)
                    this.port++
                    this.server!.listen(this.port, '0.0.0.0', () => {
                        this.running = true
                        log.info(`[Server] HTTP server started on port ${this.port}`)
                        resolve(this.port)
                    })
                } else {
                    log.error(`[Server] Failed to start: ${err.message}`)
                    reject(err)
                }
            })

            this.server.listen(this.port, '0.0.0.0', () => {
                this.running = true
                log.info(`[Server] HTTP server started on port ${this.port}`)
                resolve(this.port)
            })
        })
    }

    /**
     * 停止 HTTP 服务器
     */
    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server || !this.running) {
                resolve()
                return
            }
            this.server.close(() => {
                this.running = false
                this.server = null
                log.info('[Server] HTTP server stopped')
                resolve()
            })
        })
    }

    /**
     * 获取服务器状态
     */
    isRunning(): boolean {
        return this.running
    }

    getPort(): number {
        return this.port
    }

    /**
     * 处理所有 HTTP 请求
     */
    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            // 应用 CORS 中间件
            if (!corsMiddleware(req, res)) {
                return
            }

            // 处理 OPTIONS 预检请求
            if (req.method === 'OPTIONS') {
                res.writeHead(204)
                res.end()
                return
            }

            // 解析 URL
            const url = new URL(req.url || '/', `http://${req.headers.host}`)
            const pathname = url.pathname

            log.info(`[Server] ${req.method} ${pathname}`)

            // 路由分发
            if (pathname === '/api/server/info') {
                this.handleServerInfo(req, res)
            } else if (pathname.startsWith('/api/browse')) {
                await handleBrowseRequest(req, res, pathname, url, this.resourcePath)
            } else if (pathname === '/api/file') {
                await handleFileRequest(req, res, url)
            } else if (pathname === '/api/thumbnail') {
                await handleFileRequest(req, res, url, true)
            } else if (pathname.startsWith('/api/favorites')) {
                await handleFavoritesRequest(req, res, pathname, url)
            } else if (pathname.startsWith('/api/history')) {
                await handleHistoryRequest(req, res, pathname, url)
            } else {
                this.sendError(res, 404, 'Not Found')
            }
        } catch (error: any) {
            log.error(`[Server] Request error: ${error.message}`)
            this.sendError(res, 500, error.message || 'Internal Server Error')
        }
    }

    /**
     * 服务器信息接口
     */
    private handleServerInfo(req: http.IncomingMessage, res: http.ServerResponse) {
        const os = require('os')
        this.sendJson(res, {
            name: `Comic Reader on ${os.hostname()}`,
            version: '1.0.0',
            hostname: os.hostname(),
            resourcePath: this.resourcePath,
            port: this.port
        })
    }

    /**
     * 发送 JSON 响应
     */
    private sendJson(res: http.ServerResponse, data: any, statusCode: number = 200) {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache'
        })
        res.end(JSON.stringify(data))
    }

    /**
     * 发送错误响应
     */
    private sendError(res: http.ServerResponse, statusCode: number, message: string) {
        this.sendJson(res, { error: message }, statusCode)
    }
}

// 单例实例
let serverInstance: ComicReaderServer | null = null

/**
 * 获取服务器单例
 */
export function getServerInstance(port?: number): ComicReaderServer {
    if (!serverInstance) {
        serverInstance = new ComicReaderServer(port)
    }
    return serverInstance
}

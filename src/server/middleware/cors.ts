import http from 'http'

/**
 * CORS 中间件 - 允许局域网内所有来源访问
 */
export function corsMiddleware(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    // 允许所有来源（局域网使用，安全性由防火墙/路由器保障）
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Content-Type')
    res.setHeader('Access-Control-Max-Age', '86400') // 24小时缓存预检结果

    return true
}

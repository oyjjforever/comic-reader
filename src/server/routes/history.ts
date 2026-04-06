import http from 'http'
import { URL } from 'url'
import { getDatabase } from '../database'
import log from '../../utils/log'

/**
 * 处理历史记录相关请求（浏览历史 + 下载历史）
 */
export async function handleHistoryRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    url: URL
) {
    try {
        let body: any = {}
        if (req.method === 'POST') {
            body = await readBody(req)
        }

        // 路由分发到浏览历史或下载历史
        if (pathname.startsWith('/api/history/browse')) {
            await handleBrowseHistoryRoutes(req, res, pathname, url, body)
        } else if (pathname.startsWith('/api/history/download')) {
            await handleDownloadHistoryRoutes(req, res, pathname, url, body)
        } else {
            sendError(res, 404, 'Not Found')
        }
    } catch (error: any) {
        log.error(`[Server/History] Error: ${error.message}`)
        sendError(res, 500, error.message || 'Internal Server Error')
    }
}

// ==================== 浏览历史 ====================

async function handleBrowseHistoryRoutes(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    url: URL,
    body: any
) {
    if (req.method === 'GET' && pathname === '/api/history/browse') {
        await handleGetBrowseHistory(res, url)
    } else if (req.method === 'POST' && pathname === '/api/history/browse') {
        await handleAddBrowseHistory(res, body)
    } else if (req.method === 'DELETE' && pathname === '/api/history/browse/clear') {
        await handleClearBrowseHistory(res, url)
    } else if (req.method === 'DELETE' && pathname.match(/^\/api\/history\/browse\/\d+$/)) {
        const id = parseInt(pathname.split('/').pop()!)
        await handleDeleteBrowseHistory(res, id)
    } else {
        sendError(res, 404, 'Not Found')
    }
}

/**
 * GET /api/history/browse?limit=100&module=book
 */
async function handleGetBrowseHistory(res: http.ServerResponse, url: URL) {
    const db = await getDatabase()
    const limit = parseInt(url.searchParams.get('limit') || '100', 10)
    const module = url.searchParams.get('module')

    let query = 'SELECT * FROM browse_history ORDER BY created_at DESC LIMIT ?'
    let params: any[] = [limit]

    if (module) {
        query = 'SELECT * FROM browse_history WHERE module = ? ORDER BY created_at DESC LIMIT ?'
        params = [module, limit]
    }

    const history = await db.all(query, ...params)
    sendJson(res, { history })
}

/**
 * POST /api/history/browse
 * body: { fullPath, module }
 */
async function handleAddBrowseHistory(res: http.ServerResponse, body: any) {
    const { fullPath, module } = body

    if (!fullPath || !module) {
        sendError(res, 400, 'Missing fullPath or module')
        return
    }

    const db = await getDatabase()
    const now = new Date().toISOString()

    // 检查是否已存在，存在则更新时间
    const existing = await db.get(
        'SELECT * FROM browse_history WHERE fullPath = ? AND module = ?',
        fullPath, module
    )

    if (existing) {
        await db.run('UPDATE browse_history SET created_at = ? WHERE id = ?', now, existing.id)
    } else {
        await db.run(
            'INSERT INTO browse_history (fullPath, module, created_at) VALUES (?, ?, ?)',
            fullPath, module, now
        )
    }

    // 清理超过100条的旧记录
    await cleanupOldHistory(db, 'browse_history')

    sendJson(res, { success: true })
}

/**
 * DELETE /api/history/browse/:id
 */
async function handleDeleteBrowseHistory(res: http.ServerResponse, id: number) {
    const db = await getDatabase()
    const result = await db.run('DELETE FROM browse_history WHERE id = ?', id)

    if (!result.changes) {
        sendError(res, 404, '记录不存在')
        return
    }

    sendJson(res, { success: true })
}

/**
 * DELETE /api/history/browse/clear?module=book
 */
async function handleClearBrowseHistory(res: http.ServerResponse, url: URL) {
    const db = await getDatabase()
    const module = url.searchParams.get('module')

    let query = 'DELETE FROM browse_history'
    const params: any[] = []

    if (module) {
        query += ' WHERE module = ?'
        params.push(module)
    }

    await db.run(query, ...params)
    sendJson(res, { success: true })
}

// ==================== 下载历史 ====================

async function handleDownloadHistoryRoutes(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    url: URL,
    body: any
) {
    if (req.method === 'GET' && pathname === '/api/history/download') {
        await handleGetDownloadHistory(res, url)
    } else if (req.method === 'POST' && pathname === '/api/history/download') {
        await handleAddDownloadHistory(res, body)
    } else if (req.method === 'DELETE' && pathname === '/api/history/download/clear') {
        await handleClearDownloadHistory(res, url)
    } else if (req.method === 'DELETE' && pathname.match(/^\/api\/history\/download\/\d+$/)) {
        const id = parseInt(pathname.split('/').pop()!)
        await handleDeleteDownloadHistory(res, id)
    } else {
        sendError(res, 404, 'Not Found')
    }
}

/**
 * GET /api/history/download?limit=100&module=book
 */
async function handleGetDownloadHistory(res: http.ServerResponse, url: URL) {
    const db = await getDatabase()
    const limit = parseInt(url.searchParams.get('limit') || '100', 10)
    const module = url.searchParams.get('module')

    let query = 'SELECT * FROM download_history ORDER BY created_at DESC LIMIT ?'
    let params: any[] = [limit]

    if (module) {
        query = 'SELECT * FROM download_history WHERE module = ? ORDER BY created_at DESC LIMIT ?'
        params = [module, limit]
    }

    const history = await db.all(query, ...params)
    sendJson(res, { history })
}

/**
 * POST /api/history/download
 * body: { fullPath, module }
 */
async function handleAddDownloadHistory(res: http.ServerResponse, body: any) {
    const { fullPath, module } = body

    if (!fullPath || !module) {
        sendError(res, 400, 'Missing fullPath or module')
        return
    }

    const db = await getDatabase()
    const now = new Date().toISOString()

    const existing = await db.get(
        'SELECT * FROM download_history WHERE fullPath = ? AND module = ?',
        fullPath, module
    )

    if (existing) {
        await db.run('UPDATE download_history SET created_at = ? WHERE id = ?', now, existing.id)
    } else {
        await db.run(
            'INSERT INTO download_history (fullPath, module, created_at) VALUES (?, ?, ?)',
            fullPath, module, now
        )
    }

    await cleanupOldHistory(db, 'download_history')

    sendJson(res, { success: true })
}

/**
 * DELETE /api/history/download/:id
 */
async function handleDeleteDownloadHistory(res: http.ServerResponse, id: number) {
    const db = await getDatabase()
    const result = await db.run('DELETE FROM download_history WHERE id = ?', id)

    if (!result.changes) {
        sendError(res, 404, '记录不存在')
        return
    }

    sendJson(res, { success: true })
}

/**
 * DELETE /api/history/download/clear?module=book
 */
async function handleClearDownloadHistory(res: http.ServerResponse, url: URL) {
    const db = await getDatabase()
    const module = url.searchParams.get('module')

    let query = 'DELETE FROM download_history'
    const params: any[] = []

    if (module) {
        query += ' WHERE module = ?'
        params.push(module)
    }

    await db.run(query, ...params)
    sendJson(res, { success: true })
}

// ===== 辅助函数 =====

/**
 * 清理超过100条的旧记录
 */
async function cleanupOldHistory(db: any, tableName: string) {
    try {
        const countResult = await db.get(`SELECT COUNT(*) as count FROM ${tableName}`)
        const totalCount = countResult?.count || 0

        if (totalCount > 100) {
            const deleteCount = totalCount - 100
            await db.run(
                `DELETE FROM ${tableName} WHERE id IN (
                    SELECT id FROM ${tableName} ORDER BY created_at ASC LIMIT ?
                )`,
                deleteCount
            )
        }
    } catch (error) {
        // 静默处理清理错误
    }
}

function readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => { data += chunk })
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {})
            } catch {
                reject(new Error('Invalid JSON body'))
            }
        })
        req.on('error', reject)
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

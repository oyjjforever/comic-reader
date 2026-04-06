import http from 'http'
import { URL } from 'url'
import { getDatabase } from '../database'
import log from '../../utils/log'

/**
 * 处理收藏相关请求
 */
export async function handleFavoritesRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    url: URL
) {
    try {
        // 读取请求 body（POST/PUT/DELETE）
        let body: any = {}
        if (req.method === 'POST' || req.method === 'PUT') {
            body = await readBody(req)
        }

        if (req.method === 'GET') {
            if (pathname === '/api/favorites') {
                await handleGetFavorites(res, url)
            } else if (pathname === '/api/favorites/check') {
                await handleCheckFavorite(res, url)
            } else if (pathname === '/api/favorites/count') {
                await handleGetFavoriteCount(res, url)
            } else {
                sendError(res, 404, 'Not Found')
            }
        } else if (req.method === 'POST') {
            if (pathname === '/api/favorites') {
                await handleAddFavorite(res, body)
            } else if (pathname === '/api/favorites/toggle') {
                await handleToggleFavorite(res, body)
            } else {
                sendError(res, 404, 'Not Found')
            }
        } else if (req.method === 'DELETE') {
            if (pathname === '/api/favorites/clear') {
                await handleClearFavorites(res, url)
            } else if (pathname === '/api/favorites/by-path') {
                await handleDeleteFavoriteByPath(res, url)
            } else if (pathname.match(/^\/api\/favorites\/\d+$/)) {
                const id = parseInt(pathname.split('/').pop()!)
                await handleDeleteFavorite(res, id)
            } else {
                sendError(res, 404, 'Not Found')
            }
        } else if (req.method === 'PUT') {
            if (pathname.match(/^\/api\/favorites\/\d+\/tags$/)) {
                const parts = pathname.split('/')
                const id = parseInt(parts[parts.length - 2])
                await handleUpdateFavoriteTags(res, id, body)
            } else {
                sendError(res, 404, 'Not Found')
            }
        } else {
            sendError(res, 405, 'Method Not Allowed')
        }
    } catch (error: any) {
        log.error(`[Server/Favorites] Error: ${error.message}`)
        sendError(res, 500, error.message || 'Internal Server Error')
    }
}

/**
 * GET /api/favorites?module=book&order=id DESC
 * 获取收藏列表
 */
async function handleGetFavorites(res: http.ServerResponse, url: URL) {
    const db = await getDatabase()
    const module = url.searchParams.get('module')
    const order = url.searchParams.get('order') || 'id DESC'

    let sql = 'SELECT * FROM favorites'
    const params: any[] = []

    if (module) {
        sql += ' WHERE module = ?'
        params.push(module)
    }

    sql += ` ORDER BY ${order}`

    const favorites = await db.all(sql, ...params)
    sendJson(res, { favorites })
}

/**
 * GET /api/favorites/check?fullPath=xxx&module=book
 * 检查是否已收藏
 */
async function handleCheckFavorite(res: http.ServerResponse, url: URL) {
    const fullPath = url.searchParams.get('fullPath')
    const module = url.searchParams.get('module')

    if (!fullPath || !module) {
        sendError(res, 400, 'Missing fullPath or module parameter')
        return
    }

    const db = await getDatabase()
    const favorite = await db.get('SELECT * FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)
    sendJson(res, { isFavorited: !!favorite })
}

/**
 * GET /api/favorites/count?module=book
 * 获取收藏数量
 */
async function handleGetFavoriteCount(res: http.ServerResponse, url: URL) {
    const db = await getDatabase()
    const module = url.searchParams.get('module')

    let sql = 'SELECT COUNT(*) as count FROM favorites'
    const params: any[] = []

    if (module) {
        sql += ' WHERE module = ?'
        params.push(module)
    }

    const result = await db.get(sql, ...params)
    sendJson(res, { count: result?.count || 0 })
}

/**
 * POST /api/favorites
 * 添加收藏
 * body: { fullPath, module, tags? }
 */
async function handleAddFavorite(res: http.ServerResponse, body: any) {
    const { fullPath, module, tags } = body

    if (!fullPath || !module) {
        sendError(res, 400, 'Missing fullPath or module')
        return
    }

    const db = await getDatabase()

    // 检查是否已收藏
    const existing = await db.get('SELECT * FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)
    if (existing) {
        sendError(res, 409, '该路径已收藏')
        return
    }

    const result = await db.run(
        'INSERT INTO favorites (fullPath, module, tags, created_at) VALUES (?, ?, ?, ?)',
        fullPath, module, tags || null, new Date().toISOString()
    )

    sendJson(res, { id: result.lastID, success: true })
}

/**
 * DELETE /api/favorites/:id
 * 删除收藏 by ID
 */
async function handleDeleteFavorite(res: http.ServerResponse, id: number) {
    const db = await getDatabase()
    const result = await db.run('DELETE FROM favorites WHERE id = ?', id)

    if (!result.changes) {
        sendError(res, 404, '收藏不存在')
        return
    }

    sendJson(res, { success: true })
}

/**
 * DELETE /api/favorites/by-path?fullPath=xxx&module=book
 * 删除收藏 by path
 */
async function handleDeleteFavoriteByPath(res: http.ServerResponse, url: URL) {
    const fullPath = url.searchParams.get('fullPath')
    const module = url.searchParams.get('module')

    if (!fullPath || !module) {
        sendError(res, 400, 'Missing fullPath or module parameter')
        return
    }

    const db = await getDatabase()
    const result = await db.run('DELETE FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)

    if (!result.changes) {
        sendError(res, 404, '收藏不存在')
        return
    }

    sendJson(res, { success: true })
}

/**
 * POST /api/favorites/toggle
 * 切换收藏状态
 * body: { fullPath, module }
 */
async function handleToggleFavorite(res: http.ServerResponse, body: any) {
    const { fullPath, module } = body

    if (!fullPath || !module) {
        sendError(res, 400, 'Missing fullPath or module')
        return
    }

    const db = await getDatabase()
    const existing = await db.get('SELECT * FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)

    if (existing) {
        await db.run('DELETE FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)
        sendJson(res, { isFavorited: false })
    } else {
        await db.run(
            'INSERT INTO favorites (fullPath, module, created_at) VALUES (?, ?, ?)',
            fullPath, module, new Date().toISOString()
        )
        sendJson(res, { isFavorited: true })
    }
}

/**
 * PUT /api/favorites/:id/tags
 * 更新收藏标签
 * body: { tags: "1,2,3" }
 */
async function handleUpdateFavoriteTags(res: http.ServerResponse, id: number, body: any) {
    const { tags } = body

    if (tags === undefined) {
        sendError(res, 400, 'Missing tags')
        return
    }

    const db = await getDatabase()
    const result = await db.run('UPDATE favorites SET tags = ? WHERE id = ?', tags, id)

    if (!result.changes) {
        sendError(res, 404, '收藏不存在')
        return
    }

    sendJson(res, { success: true })
}

/**
 * DELETE /api/favorites/clear?module=book
 * 清空收藏
 */
async function handleClearFavorites(res: http.ServerResponse, url: URL) {
    const db = await getDatabase()
    const module = url.searchParams.get('module')

    let sql = 'DELETE FROM favorites'
    const params: any[] = []

    if (module) {
        sql += ' WHERE module = ?'
        params.push(module)
    }

    const result = await db.run(sql, ...params)
    sendJson(res, { success: true, deletedCount: result.changes || 0 })
}

// ===== 辅助函数 =====

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

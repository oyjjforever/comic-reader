import http from 'http'
import { URL } from 'url'
import { getDatabase } from '../database'
import log from '../../utils/log'

/**
 * 目录收藏（folder tags）路由
 * 与桌面端 preload/plugins/tag.ts 的 folder tag 体系一致：
 * 树顶"已收藏"分组、树节点书签标记均基于 tags 表 type='folder' 记录，
 * namespace 区分模块（book/video）
 *
 * GET    /api/tags/folders?module=book          目录收藏列表
 * POST   /api/tags/folders                      添加目录收藏 {label, folderPath, module}
 * DELETE /api/tags/folders?folderPath=&module=  按路径取消目录收藏
 * POST   /api/tags/folders/check-batch          批量检查目录是否已收藏 {paths: [], module}
 */
export async function handleTagsRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    url: URL
) {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
        sendError(res, 405, 'Method Not Allowed')
        return
    }

    try {
        switch (pathname) {
            case '/api/tags/folders':
                if (req.method === 'GET') {
                    await handleListFolderTags(res, url)
                } else if (req.method === 'POST') {
                    await handleAddFolderTag(req, res)
                } else {
                    await handleDeleteFolderTag(res, url)
                }
                break
            case '/api/tags/folders/check-batch':
                if (req.method === 'POST') {
                    await handleCheckFolderTags(req, res)
                } else {
                    sendError(res, 405, 'Method Not Allowed')
                }
                break
            default:
                sendError(res, 404, 'Not Found')
        }
    } catch (error: any) {
        log.error(`[Server] Tags error: ${error.message}`)
        sendError(res, 500, error.message || 'Internal Server Error')
    }
}

/** 目录收藏列表（分组数据源） */
async function handleListFolderTags(res: http.ServerResponse, url: URL) {
    const namespace = url.searchParams.get('module') || 'default'
    const db = await getDatabase()

    const tags = await db.all(
        `SELECT id, label, folderPath, namespace, sort_order, created_at
         FROM tags WHERE type = 'folder' AND namespace = ?
         ORDER BY sort_order ASC, id DESC`,
        namespace
    )
    sendJson(res, { tags })
}

/** 添加目录收藏（对齐 preload addFolderTag：同 namespace 同路径唯一，sort_order 取最大+1） */
async function handleAddFolderTag(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await readBody(req)
    const label = String(body.label || '').trim()
    const folderPath = String(body.folderPath || '').trim()
    const namespace = String(body.module || 'default')

    if (!folderPath) {
        sendError(res, 400, 'Missing folderPath')
        return
    }

    const db = await getDatabase()

    const existing = await db.get(
        'SELECT id FROM tags WHERE folderPath = ? AND namespace = ? AND type = \'folder\'',
        folderPath,
        namespace
    )
    if (existing) {
        sendJson(res, { id: existing.id, existed: true })
        return
    }

    const maxRow = await db.get(
        'SELECT MAX(sort_order) AS maxOrder FROM tags WHERE namespace = ?',
        namespace
    )
    const nextSortOrder = (maxRow?.maxOrder ?? 0) + 1

    const result = await db.run(
        `INSERT INTO tags (label, type, folderPath, namespace, sort_order, created_at)
         VALUES (?, 'folder', ?, ?, ?, ?)`,
        label || folderPath.split(/[\\/]/).pop() || folderPath,
        folderPath,
        namespace,
        nextSortOrder,
        new Date().toISOString()
    )
    sendJson(res, { id: result.lastID })
}

/** 按路径取消目录收藏 */
async function handleDeleteFolderTag(res: http.ServerResponse, url: URL) {
    const folderPath = url.searchParams.get('folderPath')
    const namespace = url.searchParams.get('module') || 'default'
    if (!folderPath) {
        sendError(res, 400, 'Missing folderPath')
        return
    }

    const db = await getDatabase()
    const result = await db.run(
        'DELETE FROM tags WHERE folderPath = ? AND namespace = ? AND type = \'folder\'',
        folderPath,
        namespace
    )
    sendJson(res, { success: true, deleted: result.changes })
}

/** 批量检查目录收藏状态（树节点书签标记） */
async function handleCheckFolderTags(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await readBody(req)
    const paths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : []
    const namespace = String(body.module || 'default')

    if (paths.length === 0) {
        sendJson(res, { tagged: {} })
        return
    }

    const db = await getDatabase()
    const placeholders = paths.map(() => '?').join(',')
    const rows = await db.all(
        `SELECT folderPath FROM tags
         WHERE type = 'folder' AND namespace = ? AND folderPath IN (${placeholders})`,
        namespace,
        ...paths
    )

    const taggedSet = new Set(rows.map((r: any) => r.folderPath))
    const tagged: Record<string, boolean> = {}
    for (const p of paths) {
        tagged[p] = taggedSet.has(p)
    }
    sendJson(res, { tagged })
}

function readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk: string) => { data += chunk })
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

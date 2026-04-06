import http from 'http'
import { URL } from 'url'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import fg from 'fast-glob'
import log from '../../utils/log'

/**
 * 支持的图片扩展名
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']

/**
 * 判断是否为图片文件
 */
function isImageFile(extension: string): boolean {
    return IMAGE_EXTENSIONS.includes(extension.toLowerCase())
}

/**
 * 判断媒体类型
 */
function determineMediaType(files: FileInfoForServer[]): string {
    if (files.length === 0) return 'empty'
    const imageCount = files.filter((f) => isImageFile(f.extension)).length
    if (imageCount === files.length && imageCount > 0) return 'image'
    return 'mixed'
}

/**
 * 服务器端文件信息接口
 */
interface FileInfoForServer {
    name: string
    fullPath: string
    extension: string
    size: number
    modifiedTime: string
}

/**
 * 服务器端文件夹信息接口
 */
interface FolderInfoForServer {
    name: string
    fullPath: string
    isLeaf: boolean
    contentType: string
    fileCount: number
    coverPath?: string
    modifiedTime?: string
}

/**
 * 处理浏览相关请求
 */
export async function handleBrowseRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    url: URL,
    resourcePath: string
) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(res, 405, 'Method Not Allowed')
        return
    }

    try {
        switch (pathname) {
            case '/api/browse/tree':
                await handleBrowseTree(res, url, resourcePath)
                break
            case '/api/browse/list':
                await handleBrowseList(res, url, resourcePath)
                break
            case '/api/browse/files':
                await handleBrowseFiles(res, url)
                break
            case '/api/browse/info':
                await handleBrowseInfo(res, url)
                break
            default:
                sendError(res, 404, 'Not Found')
        }
    } catch (error: any) {
        log.error(`[Server] Browse error: ${error.message}`)
        sendError(res, 500, error.message || 'Internal Server Error')
    }
}

/**
 * GET /api/browse/tree?path=D:/Comics
 * 获取文件夹树（直接子目录，非叶子节点）
 */
async function handleBrowseTree(
    res: http.ServerResponse,
    url: URL,
    resourcePath: string
) {
    const dirPath = url.searchParams.get('path') || resourcePath
    if (!dirPath) {
        sendError(res, 400, 'Missing path parameter')
        return
    }

    if (!fs.existsSync(dirPath)) {
        sendError(res, 404, `Path not found: ${dirPath}`)
        return
    }

    const folders = await getDirectFolders(dirPath)
    sendJson(res, {
        path: dirPath,
        folders: folders.filter((f) => !f.isLeaf) // 非叶子节点，与 getFolderTree(noLeaf=true) 一致
    })
}

/**
 * GET /api/browse/list?path=D:/Comics&page=0&pageSize=50
 * 获取叶子文件夹列表（分页）
 */
async function handleBrowseList(
    res: http.ServerResponse,
    url: URL,
    resourcePath: string
) {
    const dirPath = url.searchParams.get('path') || resourcePath
    if (!dirPath) {
        sendError(res, 400, 'Missing path parameter')
        return
    }

    if (!fs.existsSync(dirPath)) {
        sendError(res, 404, `Path not found: ${dirPath}`)
        return
    }

    const page = parseInt(url.searchParams.get('page') || '0', 10)
    const pageSize = parseInt(url.searchParams.get('pageSize') || '50', 10)

    // 获取所有直接子文件夹
    const allFolders = (await getDirectFolders(dirPath)).filter((f) => f.isLeaf)

    // 分页
    const startIndex = page * pageSize
    const endIndex = startIndex + pageSize
    const paginatedFolders = allFolders.slice(startIndex, endIndex)

    // 为每个文件夹加载详细信息（文件数量、类型、封面）
    const foldersWithDetails = await Promise.all(
        paginatedFolders.map((folder) => loadFolderDetails(folder))
    )

    sendJson(res, {
        path: dirPath,
        folders: foldersWithDetails,
        hasMore: endIndex < allFolders.length,
        total: allFolders.length
    })
}

/**
 * GET /api/browse/files?path=D:/Comics/xxx
 * 获取文件夹内的文件列表
 */
async function handleBrowseFiles(res: http.ServerResponse, url: URL) {
    const dirPath = url.searchParams.get('path')
    if (!dirPath) {
        sendError(res, 400, 'Missing path parameter')
        return
    }

    if (!fs.existsSync(dirPath)) {
        sendError(res, 404, `Path not found: ${dirPath}`)
        return
    }

    const stat = await fsp.stat(dirPath)
    if (!stat.isDirectory()) {
        sendError(res, 400, 'Path is not a directory')
        return
    }

    const files = await getFilesFromPath(dirPath)
    sendJson(res, {
        path: dirPath,
        files: files
    })
}

/**
 * GET /api/browse/info?path=D:/Comics/xxx
 * 获取文件夹详细信息
 */
async function handleBrowseInfo(res: http.ServerResponse, url: URL) {
    const dirPath = url.searchParams.get('path')
    if (!dirPath) {
        sendError(res, 400, 'Missing path parameter')
        return
    }

    if (!fs.existsSync(dirPath)) {
        sendError(res, 404, `Path not found: ${dirPath}`)
        return
    }

    const stat = await fsp.stat(dirPath)
    const name = path.basename(dirPath)

    if (stat.isDirectory()) {
        const files = await getFilesFromPath(dirPath)
        const contentType = determineMediaType(files)
        const coverPath = files.length > 0 ? files[0].fullPath : undefined

        sendJson(res, {
            name,
            fullPath: dirPath,
            isLeaf: true,
            contentType,
            fileCount: files.length,
            coverPath,
            modifiedTime: stat.mtime.toISOString()
        })
    } else {
        sendJson(res, {
            name,
            fullPath: dirPath,
            extension: path.extname(name).toLowerCase(),
            size: stat.size,
            modifiedTime: stat.mtime.toISOString()
        })
    }
}

// ===== 文件系统操作函数（复用 preload/plugins/file.ts 和 media.ts 的逻辑）=====

/**
 * 获取直接子目录
 * 对应 preload/plugins/file.ts -> getDirectFoldersFromPath
 */
async function getDirectFolders(dirPath: string): Promise<FolderInfoForServer[]> {
    const entries = (await fg(['*/'], {
        cwd: dirPath,
        onlyDirectories: true,
        absolute: true
    })) as string[]

    const folders: FolderInfoForServer[] = []

    for (const childPath of entries) {
        try {
            const name = path.basename(childPath)
            const subChildren = await fsp.readdir(childPath, { withFileTypes: true })
            const hasSubfolders = subChildren.some((_) => _.isDirectory())

            folders.push({
                name,
                fullPath: childPath,
                isLeaf: !hasSubfolders,
                contentType: 'loading',
                fileCount: 0
            })
        } catch (_) {
            continue
        }
    }

    return folders
}

/**
 * 加载文件夹详细信息
 * 对应 preload/plugins/media.ts -> getFolderInfo
 */
async function loadFolderDetails(folder: FolderInfoForServer): Promise<FolderInfoForServer> {
    try {
        const files = await getFilesFromPath(folder.fullPath)
        const contentType = determineMediaType(files)
        const coverPath = files.length > 0 ? files[0].fullPath : undefined

        return {
            ...folder,
            contentType,
            fileCount: files.length,
            coverPath
        }
    } catch (error) {
        return folder
    }
}

/**
 * 获取目录下的文件列表
 * 对应 preload/plugins/file.ts -> getFilesFromPath
 */
async function getFilesFromPath(dirPath: string): Promise<FileInfoForServer[]> {
    const filePaths = (await fg(['*'], { cwd: dirPath, absolute: true })) as string[]

    const files: FileInfoForServer[] = []

    for (const itemPath of filePaths) {
        try {
            const itemStat = await fsp.stat(itemPath)
            if (itemStat.isFile()) {
                const item = path.basename(itemPath)
                files.push({
                    name: item,
                    fullPath: itemPath,
                    extension: path.extname(item).toLowerCase(),
                    size: itemStat.size,
                    modifiedTime: itemStat.mtime.toISOString()
                })
            }
        } catch (_) {
            continue
        }
    }

    // 按文件名自然排序（与 media.ts 的 sortFiles 一致）
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }))

    return files
}

// ===== 响应辅助函数 =====

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

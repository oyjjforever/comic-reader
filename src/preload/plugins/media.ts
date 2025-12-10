import File from './file'
import { FolderInfo, FileInfo, SortOptions } from '@/typings/file'

/**
 * 支持的图片格式
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']

/**
 * 支持的视频格式
 */
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.ogg', '.ogv']

/**
 * 判断文件是否为图片
 */
function isImageFile(file: FileInfo): boolean {
    return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())
}

/**
 * 判断文件是否为视频
 */
function isVideoFile(file: FileInfo): boolean {
    return VIDEO_EXTENSIONS.includes(file.extension.toLowerCase())
}

/**
 * 判断媒体类型
 */
function determineMediaType(files: FileInfo[]): 'image' | 'video' | 'mixed' | 'empty' | string {
    if (files.length === 0) {
        return 'empty'
    }

    const extensions = new Set(files.map((file) => file.extension.toLowerCase()))
    const imageCount = files.filter(isImageFile).length
    const videoCount = files.filter(isVideoFile).length

    // 如果全是图片
    if (imageCount === files.length && imageCount > 0) {
        return 'image'
    }
    // 如果全是视频
    if (videoCount === files.length && videoCount > 0) {
        return 'video'
    }
    // 如果包含多种类型
    if (extensions.size > 1) {
        return 'mixed'
    }
    // 单一类型但不是图片或视频
    if (extensions.size === 1) {
        return Array.from(extensions)[0].toString().slice(1)
    }

    return 'unknown'
}

async function getFolderInfo(path: string, sortOptions?: SortOptions): Promise<FolderInfo> {
    try {
        // 先获取文件夹信息
        const folder = await File.getFolderInfo(path)
        // 在获取内部文件列表
        let files = await getFiles(path, sortOptions)
        // 判断文件夹类型
        const contentType = determineMediaType(files)
        const coverPath = files[0]?.fullPath
        return {
            ...folder,
            fileCount: files.length,
            coverPath,
            contentType
        }
    } catch (error) {
        throw new Error(
            `获取文件夹详细信息失败: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

async function getFolderTree(
    dirPath: string,
    noLeaf: boolean = false
): Promise<FolderInfo[]> {
    try {
        const tree = await File.getDirectFoldersFromPath(dirPath)
        return noLeaf ? tree.filter(_ => !_.isLeaf) : tree
    } catch (error) {
        throw new Error(`获取文件夹列表失败: ${error instanceof Error ? error.message : String(error)}`)
    }
}

async function getFolderList(
    dirPath: string,
): Promise<FolderInfo[]> {
    try {
        const folders = (await File.getDirectFoldersFromPath(dirPath)).filter(_ => _.isLeaf)
        // 为每个文件夹分析内容类型
        const folderInfo = await Promise.all(
            folders.map(async (folder) => {
                return await getFolderInfo(folder.fullPath)
            })
        )
        return folderInfo
    } catch (error) {
        throw new Error(`获取文件夹列表失败: ${error instanceof Error ? error.message : String(error)}`)
    }
}

async function getFileInfo(
    dirPath: string,
): Promise<FileInfo> {
    try {
        return await File.getFileInfo(dirPath)
    } catch (error) {
        throw new Error(`获取文件信息: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * 获取指定文件夹路径下的所有文件（支持排序）
 * @param dirPath 目录路径
 * @param sortOptions 排序选项，可选
 * @param filterExtensions 文件扩展名过滤器，可选
 * @param mediaType 媒体类型过滤器，可选 'image', 'video', 'all'
 * @returns 文件信息数组
 */
async function getFiles(
    dirPath: string,
    sortOptions: SortOptions = {
        type: 'name',
        order: 'asc'
    },
    filterExtensions?: string[],
    mediaType: 'image' | 'video' | 'all' = 'all'
): Promise<FileInfo[]> {
    try {
        let files = await File.getFilesFromPath(dirPath, false)

        // 根据媒体类型过滤文件
        if (mediaType === 'image') {
            files = files.filter(isImageFile)
        } else if (mediaType === 'video') {
            files = files.filter(isVideoFile)
        }

        // 如果指定了扩展名过滤器，进一步过滤
        if (filterExtensions && filterExtensions.length > 0) {
            files = files.filter(file =>
                filterExtensions.includes(file.extension.toLowerCase())
            )
        }

        // 如果指定了排序选项，进行排序
        if (sortOptions) {
            files = sortFiles(files, sortOptions)
        }
        return files
    } catch (error) {
        throw new Error(`获取文件列表失败: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * 对文件列表进行排序
 * @param files 文件信息数组
 * @param sortOptions 排序选项
 * @returns 排序后的文件信息数组
 */
function sortFiles(files: FileInfo[], sortOptions: SortOptions): FileInfo[] {
    const { type, order } = sortOptions

    return files.sort((a, b) => {
        let comparison = 0

        switch (type) {
            case 'name':
                comparison = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
                break
            case 'createdTime':
                comparison = a.createdTime.getTime() - b.createdTime.getTime()
                break
            case 'modifiedTime':
                comparison = a.modifiedTime.getTime() - b.modifiedTime.getTime()
                break
            case 'size':
                comparison = a.size - b.size
                break
            default:
                comparison = 0
        }

        return order === 'desc' ? -comparison : comparison
    })
}

/**
 * 获取文件夹封面信息
 * @param filePath 文件夹路径
 * @returns 封面路径和封面文件名
 */
async function getFolderCoverInfo(filePath: string): Promise<{ coverPath?: string; coverFileName?: string }> {
    try {
        const files = await getFiles(filePath, { type: 'name', order: 'asc' })
        if (files.length === 0) {
            return {}
        }

        // 优先返回图片作为封面
        const imageFiles = files.filter(isImageFile)
        if (imageFiles.length > 0) {
            return {
                coverPath: imageFiles[0].fullPath,
                coverFileName: imageFiles[0].name
            }
        }

        // 如果没有图片，返回第一个文件
        return {
            coverPath: files[0].fullPath,
            coverFileName: files[0].name
        }
    } catch (error) {
        throw new Error(`获取封面信息失败: ${error instanceof Error ? error.message : String(error)}`)
    }
}

export default {
    getFolderTree,
    getFolderList,
    getFiles,
    getFolderInfo,
    getFileInfo,
    getFolderCoverInfo,
    // 工具函数
    isImageFile,
    isVideoFile,
    determineMediaType,
    // 常量
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS
}
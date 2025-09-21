import FileUtils from '../../../utils/file'
import { FolderInfo, FileInfo } from "@/typings/file";

/**
 * 文件夹返回格式枚举
 */
export enum FolderStructureType {
  /** 平铺格式 - 返回所有最下级文件夹 */
  FLAT = 'flat',
  /** 树形格式 - 返回带父子级关系的文件夹 */
  TREE = 'tree'
}

/**
 * 排序类型枚举
 */
export enum SortType {
  /** 按名称排序 */
  NAME = 'name',
  /** 按创建时间排序 */
  CREATED_TIME = 'createdTime',
  /** 按修改时间排序 */
  MODIFIED_TIME = 'modifiedTime',
  /** 按文件大小排序 */
  SIZE = 'size'
}

/**
 * 排序方向枚举
 */
export enum SortOrder {
  /** 升序 */
  ASC = 'asc',
  /** 降序 */
  DESC = 'desc'
}

/**
 * 排序选项接口
 */
export interface SortOptions {
  /** 排序类型 */
  type: SortType
  /** 排序方向 */
  order: SortOrder
}

/**
 * 文件夹信息扩展接口（包含封面图）
 */
export interface FolderInfoWithCover extends FolderInfo {
  /** 封面图路径 */
  coverPath?: string
  /** 封面图文件名 */
  coverFileName?: string
}

/**
 * 支持的图片格式
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']

/**
 * 分析文件夹内容类型
 * @param folderPath 文件夹路径
 * @returns 文件夹内容类型
 */
async function analyzeFolderContentType(folderPath: string): Promise<string> {
  try {
    const filesInfo = await FileUtils.getFilesInfo(folderPath, false)

    if (filesInfo.length === 0) {
      return 'empty'
    }

    const extensions = new Set(filesInfo.map(file => file.extension.toLowerCase()))
    // 如果包含多种类型
    if (extensions.size > 1) {
      return 'mixed'
    }
    // 检查是否只包含图片
    const imageExtensions = Array.from(extensions).filter(ext => IMAGE_EXTENSIONS.includes(ext))
    const nonImageExtensions = Array.from(extensions).filter(ext => !IMAGE_EXTENSIONS.includes(ext))

    if (imageExtensions.length > 0 && nonImageExtensions.length === 0) {
      return 'image'
    }

    // 检查是否只包含PDF
    const pdfExtensions = Array.from(extensions).filter(ext => ext === '.pdf')
    const nonPdfExtensions = Array.from(extensions).filter(ext => ext !== '.pdf')

    if (pdfExtensions.length > 0 && nonPdfExtensions.length === 0) {
      return 'pdf'
    }

    return Array.from(extensions)[0].toString().slice(1)
  } catch (error) {
    console.warn(`分析文件夹内容类型失败: ${folderPath}`, error)
    return 'unknown'
  }
}

/**
 * 获取指定路径下的所有文件夹（包含内容类型分析）
 * @param dirPath 目录路径
 * @param structureType 结构类型
 * @returns 文件夹信息数组
 */
async function getFolders(dirPath: string, structureType: FolderStructureType = FolderStructureType.FLAT
): Promise<FolderInfo[]> {
  try {
    const foldersInfo = await FileUtils.getFoldersInfo(dirPath, structureType)

    // 为每个文件夹分析内容类型
    const foldersWithContentType = await Promise.all(
      foldersInfo.map(async (folder) => {
        const contentType = await analyzeFolderContentType(folder.fullPath)
        return {
          ...folder,
          contentType
        }
      })
    )

    return foldersWithContentType
  } catch (error) {
    throw new Error(`获取文件夹列表失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 获取单个文件夹的封面信息（按需加载）
 * @param folderPath 文件夹路径
 * @returns 封面信息
 */
async function getFolderCoverInfo(folderPath: string): Promise<{ coverPath?: string; coverFileName?: string }> {
  try {
    let filesInfo = await FileUtils.getFilesInfo(folderPath, false)
    if (filesInfo.length === 0) return {}
    // 如果优先选择图片文件
    // 先查找图片文件
    const imageFiles = filesInfo.filter(file =>
      IMAGE_EXTENSIONS.includes(file.extension)
    )

    if (imageFiles.length > 0) {
      // 按文件名排序，选择第一个图片文件
      imageFiles.sort((a, b) => a.name.localeCompare(b.name))
      return {
        coverPath: imageFiles[0].fullPath,
        coverFileName: imageFiles[0].name
      }
    }
    return {}
  } catch (error) {
    console.warn(`获取文件夹封面失败: ${folderPath}`, error)
    return {}
  }
}

/**
 * 获取指定文件夹路径下的所有文件（支持排序）
 * @param dirPath 目录路径
 * @param sortOptions 排序选项，可选
 * @param includeSubfolders 是否包含子文件夹中的文件，默认为 false
 * @param filterExtensions 文件扩展名过滤器，可选
 * @returns 文件信息数组
 */
async function getFiles(
  dirPath: string,
  sortOptions?: SortOptions,
  includeSubfolders: boolean = false,
  filterExtensions?: string[]
): Promise<FileInfo[]> {
  try {
    let filesInfo = await FileUtils.getFilesInfo(dirPath, includeSubfolders)

    // 如果指定了文件扩展名过滤器，进行过滤
    if (filterExtensions && filterExtensions.length > 0) {
      const normalizedExtensions = filterExtensions.map(ext => ext.toLowerCase())
      filesInfo = filesInfo.filter(file =>
        normalizedExtensions.includes(file.extension)
      )
    }

    // 如果指定了排序选项，进行排序
    if (sortOptions) {
      filesInfo = sortFiles(filesInfo, sortOptions)
    }

    return filesInfo
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
      case SortType.NAME:
        comparison = a.name.localeCompare(b.name)
        break
      case SortType.CREATED_TIME:
        comparison = a.createdTime.getTime() - b.createdTime.getTime()
        break
      case SortType.MODIFIED_TIME:
        comparison = a.modifiedTime.getTime() - b.modifiedTime.getTime()
        break
      case SortType.SIZE:
        comparison = a.size - b.size
        break
      default:
        comparison = 0
    }

    return order === SortOrder.DESC ? -comparison : comparison
  })
}

/**
 * 读取文件内容为 Buffer
 * @param filePath 文件路径
 * @returns 文件内容 Buffer
 */
async function readFileBuffer(filePath: string): Promise<Buffer> {
  try {
    return await FileUtils.readFileBuffer(filePath)
  } catch (error) {
    throw new Error(`读取文件 Buffer 失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function getFolderInfo(filePath: string): Promise<FolderInfo> {
  try {
    const folder = await FileUtils.getFolderInfo(filePath)
    const contentType = await analyzeFolderContentType(filePath)
    return {
      ...folder,
      contentType
    }
  } catch (error) {
    throw new Error(`获取文件夹信息失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}
const book = {
  getFolders,
  getFiles,
  getFolderCoverInfo,
  analyzeFolderContentType,
  readFileBuffer,
  getFolderInfo
}

export default book
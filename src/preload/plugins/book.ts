import File from './file'
import { FolderInfo, FileInfo, SortOptions } from '@/typings/file'

/**
 * 支持的图片格式
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']

async function getFolderInfo(path: string, sortOptions?: SortOptions): Promise<FolderInfo> {
  try {
    // 先获取文件夹信息
    const folder = await File.getFolderInfo(path)
    // 在获取内部文件列表
    let files = await getFiles(path, sortOptions)
    // 判断文件夹类型
    let contentType: string
    const extensions = new Set(files.map((file) => file.extension.toLowerCase()))
    // 如果包含多种类型
    if (extensions.size < 1) {
      contentType = 'empty'
    }
    // 检查是否包含图片
    else if (IMAGE_EXTENSIONS.includes(Array.from(extensions)[0])) {
      contentType = 'image'
    } else if (extensions.size > 1) {
      contentType = 'mixed'
    } else {
      contentType = Array.from(extensions)[0].toString().slice(1)
    }
    const coverPath = contentType === 'image' ? files[0]?.fullPath : ''
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
): Promise<FolderInfo[]> {
  try {
    return await File.getAllChildrenFolders(dirPath, 0, dirPath, false)
  } catch (error) {
    throw new Error(`获取文件夹列表失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function getFolderList(
  dirPath: string,
): Promise<FolderInfo[]> {
  try {
    const folders = (await File.getDirectChildrenFolders(dirPath)).filter(_ => _.isLeaf)
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

/**
 * 获取指定文件夹路径下的所有文件（支持排序）
 * @param dirPath 目录路径
 * @param sortOptions 排序选项，可选
 * @param filterExtensions 文件扩展名过滤器，可选
 * @returns 文件信息数组
 */
async function getFiles(
  dirPath: string,
  sortOptions: SortOptions = {
    type: 'name',
    order: 'asc'
  },
): Promise<FileInfo[]> {
  try {
    let files = await File.getFilesInfo(dirPath, false)
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
        comparison = a.name.localeCompare(b.name)
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

export default {
  getFolderTree,
  getFolderList,
  getFiles,
  getFolderInfo
}

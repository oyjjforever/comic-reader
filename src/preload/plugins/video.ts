import File from './file'
import { FolderInfo, FileInfo, SortOptions } from '@/typings/file'

/**
 * 支持的图片格式
 */
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".m4v"]

async function getFolderTree(
  dirPath: string,
): Promise<FolderInfo[]> {
  try {
    return await File.getDirectFoldersFromPath(dirPath)
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
    let files = await File.getFilesFromPath(dirPath, false)
    // 过滤非视频文件
    files = files.filter((file) => {
      return VIDEO_EXTENSIONS.includes(file.extension.toLowerCase())
    })
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
  getFileInfo,
  getFiles,
}

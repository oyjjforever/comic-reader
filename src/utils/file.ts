import fs from 'fs'
import path from 'path'
import { FolderInfo, FileInfo } from '@/typings/file'

/**
 * 文件夹返回格式枚举
 */
export enum FolderStructureType {
  FLAT = 'flat', // 平铺格式 - 返回所有最下级文件夹
  TREE = 'tree' // 树形格式 - 返回带父子级关系的文件夹
}

/**
 * 文件工具类
 */
export class FileUtils {
  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化后的大小字符串
   */
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 检查路径是否存在
   * @param targetPath 目标路径
   * @returns 是否存在
   */
  private static pathExists(targetPath: string): boolean {
    try {
      return fs.existsSync(targetPath)
    } catch (error) {
      return false
    }
  }

  /**
   * 获取单个文件夹的详细信息
   * @param folderPath 文件夹路径
   * @returns 文件夹信息
   */
  static getFolderInfo(folderPath: string): FolderInfo {
    try {
      // 路径验证
      if (!this.pathExists(folderPath)) {
        throw new Error(`路径不存在: ${folderPath}`)
      }

      const stat = fs.statSync(folderPath)
      if (!stat.isDirectory()) {
        throw new Error(`指定路径不是目录: ${folderPath}`)
      }
      // 构建文件夹信息
      const name = path.basename(folderPath)
      const parentPath = path.dirname(folderPath)

      return {
        name,
        fullPath: folderPath,
        createdTime: stat.birthtime,
        modifiedTime: stat.mtime,
        parentPath: parentPath !== folderPath ? parentPath : undefined
      }
    } catch (error) {
      throw new Error(
        `获取文件夹信息失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  /**
   * 获取指定路径下的所有文件夹信息
   * @param dirPath 目录路径
   * @param structureType 返回格式类型：flat(平铺) 或 tree(树形)
   * @returns 文件夹信息数组
   */
  static getFoldersInfo(
    dirPath: string,
    structureType: FolderStructureType = FolderStructureType.FLAT
  ): FolderInfo[] {
    try {
      if (structureType === FolderStructureType.TREE) {
        return this.getAllChildrenFolders(dirPath)
      }
      return this.getDirectChildrenFolders(dirPath)
    } catch (error) {
      throw new Error(
        `获取文件夹信息失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  static getDirectChildrenFolders(dirPath: string): FolderInfo[] {
    // 检查路径是否存在
    if (!this.pathExists(dirPath)) {
      throw new Error(`路径不存在: ${dirPath}`)
    }

    // 检查是否为目录
    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      throw new Error(`指定路径不是目录: ${dirPath}`)
    }
    const children = fs.readdirSync(dirPath, { withFileTypes: true })
    const foldersInfo: FolderInfo[] = []
    for (const child of children) {
      try {
        // 只处理文件夹
        if (child.isDirectory()) {
          const childPath = path.join(child.path, child.name)
          const subChildren = fs.readdirSync(childPath, { withFileTypes: true })
          const hasSubfolders = subChildren.some((_) => _.isDirectory())
          const folderInfo: FolderInfo = {
            name: child.name,
            fullPath: path.join(child.path, child.name),
            isLeaf: !hasSubfolders,
          }
          foldersInfo.push(folderInfo)
        }
      } catch (error) {
        // 跳过无法访问的文件夹
        continue
      }
    }

    return foldersInfo
  }
  /**
   * 根据指定格式获取文件夹信息
   * @param dirPath 目录路径
   * @param currentDepth 当前深度
   * @param basePath 基础路径
   * @param parentPath 父路径
   * @returns 文件夹信息数组
   */
  static getAllChildrenFolders(
    dirPath: string,
    currentDepth: number = 0,
    basePath: string = dirPath
  ): FolderInfo[] {
    // 检查路径是否存在
    if (!this.pathExists(dirPath)) {
      throw new Error(`路径不存在: ${dirPath}`)
    }

    // 检查是否为目录
    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      throw new Error(`指定路径不是目录: ${dirPath}`)
    }
    const children = fs.readdirSync(dirPath, { withFileTypes: true })
    const foldersInfo: FolderInfo[] = []
    for (const child of children) {
      try {
        // 只处理文件夹
        if (child.isDirectory()) {
          const childPath = path.join(child.path, child.name)
          const subChildren = fs.readdirSync(childPath, { withFileTypes: true })
          const hasSubfolders = subChildren.some((_) => _.isDirectory())
          const isLeaf = !hasSubfolders
          const folderInfo: FolderInfo = {
            name: child.name,
            fullPath: childPath,
            depth: currentDepth,
            isLeaf: !hasSubfolders,
            children: []
          }
          // 递归获取子文件夹
          if (hasSubfolders) {
            folderInfo.children = this.getAllChildrenFolders(
              childPath,
              currentDepth + 1,
              basePath
            )
          }
          if (!isLeaf) {
            foldersInfo.push(folderInfo)
          }
        }
      } catch (error) {
        // 跳过无法访问的文件夹
        continue
      }
    }

    return foldersInfo
  }

  /**
 * 获取指定文件夹路径下的所有文件信息
 * @param dirPath 目录路径
 * @param includeSubfolders 是否包含子文件夹中的文件，默认为 false
 * @returns 文件信息数组
 */
  static getFilesInfo(dirPath: string, includeSubfolders: boolean = false): FileInfo[] {
    try {
      // 检查路径是否存在
      if (!this.pathExists(dirPath)) {
        throw new Error(`路径不存在: ${dirPath}`)
      }

      // 检查是否为目录
      const stat = fs.statSync(dirPath)
      if (!stat.isDirectory()) {
        throw new Error(`指定路径不是目录: ${dirPath}`)
      }

      const filesInfo: FileInfo[] = []

      const processDirectory = (currentPath: string) => {
        const items = fs.readdirSync(currentPath)

        for (const item of items) {
          const itemPath = path.join(currentPath, item)
          const itemStat = fs.statSync(itemPath)

          if (itemStat.isFile()) {
            const fileInfo: FileInfo = {
              name: item,
              fullPath: itemPath,
              extension: path.extname(item).toLowerCase(),
              createdTime: itemStat.birthtime,
              modifiedTime: itemStat.mtime,
              size: itemStat.size,
              formattedSize: this.formatFileSize(itemStat.size)
            }
            filesInfo.push(fileInfo)
          } else if (itemStat.isDirectory() && includeSubfolders) {
            // 递归处理子文件夹
            processDirectory(itemPath)
          }
        }
      }

      processDirectory(dirPath)
      return filesInfo
    } catch (error) {
      throw new Error(`获取文件信息失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 读取文件内容为 Buffer
   * @param filePath 文件路径
   * @returns 文件内容 Buffer
   */
  static async readFileBuffer(filePath: string): Promise<Buffer> {
    try {
      // 检查文件是否存在
      if (!this.pathExists(filePath)) {
        throw new Error(`文件不存在: ${filePath}`)
      }

      // 检查是否为文件
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) {
        throw new Error(`指定路径不是文件: ${filePath}`)
      }

      // 读取文件内容为 Buffer
      const buffer = fs.readFileSync(filePath)
      return buffer
    } catch (error) {
      throw new Error(
        `读取文件 Buffer 失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 获取文件扩展名
   * @param filePath 文件路径
   * @returns 扩展名（包含点号）
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase()
  }

  /**
   * 获取不带扩展名的文件名
   * @param filePath 文件路径
   * @returns 不带扩展名的文件名
   */
  static getFileNameWithoutExtension(filePath: string): string {
    const name = path.basename(filePath)
    const ext = path.extname(name)
    return name.slice(0, -ext.length)
  }
}

// 导出默认实例
export default FileUtils

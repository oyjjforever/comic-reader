import fs from 'fs'
import path from 'path'
import { FolderInfo, FileInfo } from "@/typings/file";

/**
 * 文件夹返回格式枚举
 */
export enum FolderStructureType {
  FLAT = 'flat',    // 平铺格式 - 返回所有最下级文件夹
  TREE = 'tree'     // 树形格式 - 返回带父子级关系的文件夹
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
  static async getFolderInfo(folderPath: string): Promise<FolderInfo> {
    try {
      // 路径验证
      if (!this.pathExists(folderPath)) {
        throw new Error(`路径不存在: ${folderPath}`)
      }

      const stat = fs.statSync(folderPath)
      if (!stat.isDirectory()) {
        throw new Error(`指定路径不是目录: ${folderPath}`)
      }

      // 统计文件夹内容
      const { fileCount, folderCount, hasSubfolders } = this.analyzeFolderContent(folderPath)

      // 构建文件夹信息
      const name = path.basename(folderPath)
      const parentPath = path.dirname(folderPath)

      return {
        name,
        fullPath: folderPath,
        createdTime: stat.birthtime,
        modifiedTime: stat.mtime,
        fileCount,
        folderCount,
        totalItems: fileCount + folderCount,
        relativePath: '',
        depth: 0,
        parentPath: parentPath !== folderPath ? parentPath : undefined,
        isLeaf: !hasSubfolders,
        children: []
      }
    } catch (error) {
      throw new Error(`获取文件夹信息失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 分析文件夹内容统计
   * @param folderPath 文件夹路径
   * @returns 内容统计信息
   */
  private static analyzeFolderContent(folderPath: string): {
    fileCount: number
    folderCount: number
    hasSubfolders: boolean
  } {
    let fileCount = 0
    let folderCount = 0
    let hasSubfolders = false

    try {
      const items = fs.readdirSync(folderPath)

      for (const item of items) {
        const itemPath = path.join(folderPath, item)

        try {
          const itemStat = fs.statSync(itemPath)

          if (itemStat.isFile()) {
            fileCount++
          } else if (itemStat.isDirectory()) {
            folderCount++
            hasSubfolders = true
          }
        } catch {
          // 跳过无法访问的项目
          continue
        }
      }
    } catch {
      // 如果无法读取文件夹内容，保持默认值
    }

    return { fileCount, folderCount, hasSubfolders }
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
      // 检查路径是否存在
      if (!this.pathExists(dirPath)) {
        throw new Error(`路径不存在: ${dirPath}`)
      }

      // 检查是否为目录
      const stat = fs.statSync(dirPath)
      if (!stat.isDirectory()) {
        throw new Error(`指定路径不是目录: ${dirPath}`)
      }
      if (structureType === FolderStructureType.TREE) {
        return this.getAllChildrenFolders(dirPath)
      }
      return this.getDirectChildrenFolders(dirPath)
    } catch (error) {
      throw new Error(`获取文件夹信息失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  private static getDirectChildrenFolders(
    dirPath: string): FolderInfo[] {
    const items = fs.readdirSync(dirPath)
    const foldersInfo: FolderInfo[] = []

    for (const item of items) {
      const itemPath = path.join(dirPath, item)

      try {
        const itemStat = fs.statSync(itemPath)

        // 只处理文件夹
        if (itemStat.isDirectory()) {
          // 使用统一的内容分析方法
          const { fileCount, folderCount } = this.analyzeFolderContent(itemPath)
          const folderInfo: FolderInfo = {
            name: item,
            fullPath: itemPath,
            createdTime: itemStat.birthtime,
            modifiedTime: itemStat.mtime,
            fileCount,
            folderCount,
            totalItems: fileCount + folderCount,
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
  private static getAllChildrenFolders(
    dirPath: string,
    currentDepth: number = 0,
    basePath: string = dirPath,
    parentPath?: string
  ): FolderInfo[] {
    const items = fs.readdirSync(dirPath)
    const foldersInfo: FolderInfo[] = []

    for (const item of items) {
      const itemPath = path.join(dirPath, item)

      try {
        const itemStat = fs.statSync(itemPath)

        // 只处理文件夹
        if (itemStat.isDirectory()) {
          // 使用统一的内容分析方法
          const { fileCount, folderCount, hasSubfolders } = this.analyzeFolderContent(itemPath)

          const relativePath = path.relative(basePath, itemPath)
          const isLeaf = !hasSubfolders

          const folderInfo: FolderInfo = {
            name: item,
            fullPath: itemPath,
            createdTime: itemStat.birthtime,
            modifiedTime: itemStat.mtime,
            fileCount,
            folderCount,
            totalItems: fileCount + folderCount,
            relativePath,
            depth: currentDepth,
            parentPath,
            isLeaf,
            children: []
          }
          // 树形结构：递归获取子文件夹
          if (hasSubfolders) {
            folderInfo.children = this.getAllChildrenFolders(
              itemPath,
              currentDepth + 1,
              basePath,
              itemPath
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
  static async getFilesInfo(dirPath: string, includeSubfolders: boolean = false): Promise<FileInfo[]> {
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
      throw new Error(`读取文件 Buffer 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取文件或文件夹的基本信息
   * @param targetPath 目标路径
   * @returns 基本信息
   */
  static async getPathInfo(targetPath: string): Promise<{
    name: string
    fullPath: string
    isFile: boolean
    isDirectory: boolean
    size: number
    formattedSize: string
    createdTime: Date
    modifiedTime: Date
  }> {
    try {
      if (!this.pathExists(targetPath)) {
        throw new Error(`路径不存在: ${targetPath}`)
      }

      const stat = fs.statSync(targetPath)
      const name = path.basename(targetPath)

      return {
        name,
        fullPath: targetPath,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        formattedSize: this.formatFileSize(stat.size),
        createdTime: stat.birthtime,
        modifiedTime: stat.mtime
      }
    } catch (error) {
      throw new Error(`获取路径信息失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 检查文件是否为指定类型
   * @param filePath 文件路径
   * @param extensions 允许的扩展名数组，如 ['.txt', '.md']
   * @returns 是否为指定类型
   */
  static isFileType(filePath: string, extensions: string[]): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return extensions.map(e => e.toLowerCase()).includes(ext)
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
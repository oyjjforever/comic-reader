import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { FolderInfo, FileInfo } from '@/typings/file'
const ensuredDirs = new Set()
function ensureDir(filePath) {
  const dirPath = path.dirname(filePath)
  if (ensuredDirs.has(dirPath)) return
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  ensuredDirs.add(dirPath)
}
function simpleSanitize(filename, replacement = '') {
  if (typeof filename !== 'string') return ''
  return filename
    .replace(/[#<>:"/\\|?*]/g, replacement) // 移除非法字符
    .replace(/^[\s.]+|[\s.]+$/g, '') // 移除首尾空格和点
}
/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的大小字符串
 */
function formatFileSize(bytes: number): string {
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
function pathExists(targetPath: string): boolean {
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
async function getFolderInfo(folderPath: string): Promise<FolderInfo> {
  try {
    // 路径验证
    if (!pathExists(folderPath)) {
      throw new Error(`路径不存在: ${folderPath}`)
    }

    const stat = await fsp.stat(folderPath)
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
* 获取单个文件的详细信息
* @param filepath 文件夹路径
* @returns 文件夹信息
*/
async function getFileInfo(filepath: string): Promise<FileInfo> {
  try {
    // 路径验证
    if (!pathExists(filepath)) {
      throw new Error(`路径不存在: ${filepath}`)
    }

    const file = await fsp.stat(filepath)
    // 构建文件信息
    const name = path.basename(filepath)

    return {
      name,
      fullPath: filepath,
      extension: path.extname(name).toLowerCase(),
      createdTime: file.birthtime,
      modifiedTime: file.mtime,
      size: file.size,
      formattedSize: formatFileSize(file.size)
    }
  } catch (error) {
    throw new Error(
      `获取文件信息失败: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
async function getDirectChildrenFolders(dirPath: string): Promise<FolderInfo[]> {
  // 检查路径是否存在
  if (!pathExists(dirPath)) {
    throw new Error(`路径不存在: ${dirPath}`)
  }

  // 检查是否为目录
  const stat = await fsp.stat(dirPath)
  if (!stat.isDirectory()) {
    throw new Error(`指定路径不是目录: ${dirPath}`)
  }
  const children = await fsp.readdir(dirPath, { withFileTypes: true })
  const foldersInfo: FolderInfo[] = []
  for (const child of children) {
    try {
      // 只处理文件夹
      if (child.isDirectory()) {
        const childPath = path.join(child.path, child.name)
        const subChildren = await fsp.readdir(childPath, { withFileTypes: true })
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
async function getAllChildrenFolders(
  dirPath: string,
  currentDepth: number = 0,
  basePath: string = dirPath,
  containsLeaf: boolean = true,
): Promise<FolderInfo[]> {
  // 检查路径是否存在
  if (!pathExists(dirPath)) {
    throw new Error(`路径不存在: ${dirPath}`)
  }

  // 检查是否为目录
  const stat = await fsp.stat(dirPath)
  if (!stat.isDirectory()) {
    throw new Error(`指定路径不是目录: ${dirPath}`)
  }
  const children = await fsp.readdir(dirPath, { withFileTypes: true })
  const foldersInfo: FolderInfo[] = []
  for (const child of children) {
    try {
      // 只处理文件夹
      if (child.isDirectory()) {
        const childPath = path.join(child.path, child.name)
        const subChildren = await fsp.readdir(childPath, { withFileTypes: true })
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
          folderInfo.children = await getAllChildrenFolders(
            childPath,
            currentDepth + 1,
            basePath,
            containsLeaf
          )
        }
        if (containsLeaf || (!containsLeaf && !isLeaf)) {
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
async function getFilesInfo(dirPath: string, includeSubfolders: boolean = false): Promise<FileInfo[]> {
  try {
    // 检查路径是否存在
    if (!pathExists(dirPath)) {
      throw new Error(`路径不存在: ${dirPath}`)
    }

    // 检查是否为目录
    const stat = await fsp.stat(dirPath)
    if (!stat.isDirectory()) {
      throw new Error(`指定路径不是目录: ${dirPath}`)
    }

    const filesInfo: FileInfo[] = []

    const processDirectory = async (currentPath: string) => {
      const items = await fsp.readdir(currentPath)

      for (const item of items) {
        const itemPath = path.join(currentPath, item)
        const itemStat = await fsp.stat(itemPath)

        if (itemStat.isFile()) {
          const fileInfo: FileInfo = {
            name: item.padStart(10, '0'),
            fullPath: itemPath,
            extension: path.extname(item).toLowerCase(),
            createdTime: itemStat.birthtime,
            modifiedTime: itemStat.mtime,
            size: itemStat.size,
            formattedSize: formatFileSize(itemStat.size)
          }
          filesInfo.push(fileInfo)
        } else if (itemStat.isDirectory() && includeSubfolders) {
          // 递归处理子文件夹
          await processDirectory(itemPath)
        }
      }
    }

    await processDirectory(dirPath)
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
async function readFileBuffer(filePath: string): Promise<Buffer> {
  try {
    // 检查文件是否存在
    if (!pathExists(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }

    // 检查是否为文件
    const stat = await fsp.stat(filePath)
    if (!stat.isFile()) {
      throw new Error(`指定路径不是文件: ${filePath}`)
    }

    // 读取文件内容为 Buffer
    const buffer = await fsp.readFile(filePath)
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
function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

/**
 * 获取不带扩展名的文件名
 * @param filePath 文件路径
 * @returns 不带扩展名的文件名
 */
function getFileNameWithoutExtension(filePath: string): string {
  const name = path.basename(filePath)
  const ext = path.extname(name)
  return name.slice(0, -ext.length)
}

/**
 * 写入文件（自动创建目录）
 * @param filePath 文件路径
 * @param content 文本或二进制内容
 */
async function writeFile(filePath: string, content: string | Buffer): Promise<void> {
  ensureDir(filePath)
  await fsp.writeFile(filePath, content)
}
async function extractFile(filePath: string, extractDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath).toLowerCase()

    // 检查7zip是否可用
    let sevenZipCmd = ''
    try {
      // 尝试查找7zip安装路径
      if (process.platform === 'win32') {
        // Windows系统查找7zip
        const possiblePaths = [
          'W:\\Program Files\\7-Zip\\7z.exe',
          'C:\\Program Files\\7-Zip\\7z.exe',
          'C:\\Program Files (x86)\\7-Zip\\7z.exe',
          process.env['ProgramFiles'] + '\\7-Zip\\7z.exe',
          process.env['ProgramFiles(x86)'] + '\\7-Zip\\7z.exe'
        ]

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            sevenZipCmd = p
            break
          }
        }

        if (!sevenZipCmd) {
          // 如果找不到7zip，尝试使用系统自带的tar或使用Node.js解压库
          throw new Error('未找到7zip安装路径')
        }
      }
    } catch (err) {
      console.warn('7zip未安装，使用Node.js解压:', err)
      sevenZipCmd = ''
    }

    if (sevenZipCmd) {
      // 使用7zip解压
      const args = ['x', filePath, `-o${extractDir}`, '-y']
      const child = spawn(sevenZipCmd, args)

      child.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`7zip解压失败，退出码: ${code}`))
        }
      })

      child.on('error', (err) => {
        reject(new Error(`7zip解压错误: ${err.message}`))
      })
    } else {
      // 使用Node.js内置解压（支持zip格式）
      if (ext === '.zip') {
        const { extract } = require('zip-lib')
        extract(filePath, extractDir)
          .then(() => resolve())
          .catch((err: any) => reject(new Error(`ZIP解压失败: ${err.message}`)))
      } else {
        reject(new Error(`不支持的解压格式: ${ext}，请安装7zip`))
      }
    }
  })
}

export default {
  ensureDir,
  simpleSanitize,
  formatFileSize,
  pathExists,
  getFolderInfo,
  getFileInfo,
  getDirectChildrenFolders,
  getAllChildrenFolders,
  getFilesInfo,
  readFileBuffer,
  getFileExtension,
  getFileNameWithoutExtension,
  writeFile,
  extractFile
}
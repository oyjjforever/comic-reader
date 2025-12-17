import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import fg from 'fast-glob'
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
    .replace(/[\r\n\t\v\f\u0000-\u001F\u007F-\u009F]/g, replacement) // 移除换行符、制表符等控制字符
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
      coverPath: filepath,
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
async function getDirectFoldersFromPath(dirPath: string): Promise<FolderInfo[]> {
  // 检查路径是否存在
  if (!pathExists(dirPath)) {
    throw new Error(`路径不存在: ${dirPath}`)
  }

  // 校验为目录
  const stat = await fsp.stat(dirPath)
  if (!stat.isDirectory()) {
    throw new Error(`指定路径不是目录: ${dirPath}`)
  }

  // 使用 fast-glob 获取直接子目录
  const entries = await fg(["*/"], { cwd: dirPath, onlyDirectories: true, absolute: true, stats: true }) as any
  const foldersInfo: FolderInfo[] = []

  for (const entry of entries) {
    try {
      const childPath = typeof entry === 'string' ? entry : entry.path
      const name = path.basename(childPath)
      const subChildren = await fsp.readdir(childPath, { withFileTypes: true })
      const hasSubfolders = subChildren.some((_) => _.isDirectory())
      const folderInfo: FolderInfo = {
        name,
        fullPath: childPath,
        isLeaf: !hasSubfolders,
      }
      foldersInfo.push(folderInfo)
    } catch (_) {
      continue
    }
  }

  return foldersInfo
}
/**
 * 根据指定格式获取文件夹信息
 * @param dirPath 目录路径
 */
async function getAllFoldersFromPath(
  dirPath: string
): Promise<FolderInfo[]> {
  const root = path.resolve(dirPath)
  // 校验根路径
  if (!pathExists(root)) {
    throw new Error(`路径不存在: ${root}`)
  }
  const stat = await fsp.stat(root)
  if (!stat.isDirectory()) {
    throw new Error(`指定路径不是目录: ${root}`)
  }

  // 一次性获取所有文件夹路径
  const allFolders = await fg('**/', {
    cwd: root,
    onlyDirectories: true,
    absolute: true,
    dot: false,
    deep: Infinity
  })

  const normalize = (p: string) => path.resolve(p).replace(/[\\\/]+$/, '')

  // 构建路径映射
  const folderMap = new Map<string, FolderInfo>()

  // 先创建所有节点
  for (const rawPath of allFolders) {
    const folderPath = normalize(rawPath as string)
    const name = path.basename(folderPath)
    const relative = path.relative(root, folderPath)
    const depth = relative ? relative.split(path.sep).length : 0
    folderMap.set(folderPath, {
      name,
      fullPath: folderPath,
      depth,
      isLeaf: true,
      children: []
    })
  }
  // 构建父子关系并确定叶子节点
  for (const [folderPath, node] of folderMap) {
    const parentPath = normalize(path.dirname(folderPath))
    if (folderMap.has(parentPath)) {
      const parentNode = folderMap.get(parentPath)!
      parentNode.children!.push(node)
      parentNode.isLeaf = false
    }
  }
  // 获取根目录的直接子节点
  const normalizedRoot = normalize(root)
  let result = Array.from(folderMap.values()).filter(
    node => normalize(path.dirname(node.fullPath)) === normalizedRoot
  )
  return result
}
/**
* 获取指定文件夹路径下的所有文件信息
* @param dirPath 目录路径
* @param includeSubfolders 是否包含子文件夹中的文件，默认为 false
* @returns 文件信息数组
*/
async function getFilesFromPath(dirPath: string, includeSubfolders: boolean = false): Promise<FileInfo[]> {
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
      // 使用 fast-glob 获取当前目录下的文件和子目录名
      const filePaths = await fg(["*"], { cwd: currentPath, absolute: true })

      for (const itemPath of filePaths) {
        const itemStat = await fsp.stat(itemPath)
        const item = path.basename(itemPath)

        if (itemStat.isFile()) {
          const fileInfo: FileInfo = {
            name: item.padStart(10, '0'),
            fullPath: itemPath,
            coverPath: itemPath,
            extension: path.extname(item).toLowerCase(),
            createdTime: itemStat.birthtime,
            modifiedTime: itemStat.mtime,
            size: itemStat.size,
            formattedSize: formatFileSize(itemStat.size)
          }
          filesInfo.push(fileInfo)
        } else if (itemStat.isDirectory() && includeSubfolders) {
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
    // 使用Node.js内置解压（支持zip格式）
    if (ext === '.zip') {
      const { extract } = require('zip-lib')
      extract(filePath, extractDir)
        .then(() => {
          fs.unlinkSync(filePath)
          resolve()
        })
        .catch((err: any) => reject(new Error(`ZIP解压失败: ${err.message}`)))
    } else {
      reject(new Error(`不支持的解压格式: ${ext}，请安装7zip`))
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
  getDirectFoldersFromPath,
  getAllFoldersFromPath,
  getFilesFromPath,
  readFileBuffer,
  getFileExtension,
  getFileNameWithoutExtension,
  writeFile,
  extractFile
}
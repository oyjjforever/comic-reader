/**
 * 图片封面缩略图缓存服务（存储层）
 * 网格卡片的本地图片封面按卡片显示尺寸生成缩略图缓存，避免直接解码
 * 原图（一张 1500×2250 的封面解码约 13MB，卡片实际只需 ~1MB）。
 * 本服务只负责缓存文件的存取与清理；缩略图由渲染层用 canvas 生成后经
 * saveFromDataUrl 写入——与卡片显示走同一条 Chromium 解码路径，EXIF
 * 方向等解码行为天然一致。
 * 键 = md5(图片路径)，文件名带源文件 mtime：内容变更后自然换新键（旧
 * 条目在下次写入时清理），get 命中即新鲜，无需额外校验。
 * 与 video-cover 相互独立（目录、键空间都不相交），不影响视频封面缓存。
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import log from '../../utils/log'

const COVER_DIR_NAME = 'image-covers'

/**
 * 获取封面缓存目录
 */
export function getCoverDir(): string {
  return path.join(app.getPath('userData'), COVER_DIR_NAME)
}

/**
 * 确保封面目录存在
 */
function ensureCoverDir(): string {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** md5(图片路径)：同一张图的缓存文件名前缀 */
function hashOf(imagePath: string): string {
  return crypto.createHash('md5').update(imagePath).digest('hex')
}

/** 完整缓存文件名：md5(路径)-mtime.jpg（mtime 取整毫秒，跨次读取稳定） */
function coverName(imagePath: string, mtimeMs: number): string {
  return `${hashOf(imagePath)}-${mtimeMs}.jpg`
}

/**
 * 获取某张图的缩略图缓存路径，不存在（或源文件已删/已变更）返回 null
 */
export function getCoverPathIfExists(imagePath: string): string | null {
  try {
    const mtimeMs = Math.round(fs.statSync(imagePath).mtimeMs)
    const coverPath = path.join(getCoverDir(), coverName(imagePath, mtimeMs))
    return fs.existsSync(coverPath) ? coverPath : null
  } catch {
    return null
  }
}

/**
 * 将 data URL 缩略图写入封面缓存
 * @returns 封面文件路径；源文件已不存在时抛错（由 IPC 层兜底为 null）
 */
export function saveCoverFromDataUrl(imagePath: string, dataUrl: string): string {
  const base64Match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!base64Match) {
    throw new Error('无效的图片 data URL')
  }
  const mtimeMs = Math.round(fs.statSync(imagePath).mtimeMs)
  const dir = ensureCoverDir()
  const name = coverName(imagePath, mtimeMs)
  // 清理同路径旧 mtime 的缓存条目（内容已变，旧缩略图作废）
  const prefix = `${hashOf(imagePath)}-`
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix) && f !== name) {
      try {
        fs.unlinkSync(path.join(dir, f))
      } catch {
        // 并发删除等竞态可忽略
      }
    }
  }
  const coverPath = path.join(dir, name)
  fs.writeFileSync(coverPath, Buffer.from(base64Match[1], 'base64'))
  return coverPath
}

/**
 * 删除单个图片的所有缩略图缓存（含历史 mtime 条目）
 * @returns 是否删除了条目
 */
export function deleteCover(imagePath: string): boolean {
  return removeByPrefix(`${hashOf(imagePath)}-`) > 0
}

/**
 * 清空所有图片封面缓存
 * @returns 删除的缓存数量
 */
export function clearAllCovers(): number {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) return 0
  const files = fs.readdirSync(dir)
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(dir, f))
    } catch (err: any) {
      log.error('[ImageCover] 清理缓存失败:', err?.message)
    }
  }
  return files.length
}

/**
 * 统计封面缓存目录大小（字节）
 */
export function getCoverDirSize(): number {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) return 0
  let size = 0
  for (const f of fs.readdirSync(dir)) {
    try {
      size += fs.statSync(path.join(dir, f)).size
    } catch {
      // 文件刚被删可忽略
    }
  }
  return size
}

/**
 * 批量按路径迁移缩略图缓存（作品移动后同步缓存文件名）
 * rename 不改变 mtime，文件名的 mtime 段沿用；只换 md5 前缀。
 * @returns 实际迁移的缓存数
 */
export function renameCoverByPaths(pairs: Array<[string, string]>): number {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) return 0
  let count = 0
  for (const [oldPath, newPath] of pairs) {
    const oldPrefix = `${hashOf(oldPath)}-`
    const newPrefix = `${hashOf(newPath)}-`
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(oldPrefix)) continue
      try {
        fs.renameSync(path.join(dir, f), path.join(dir, newPrefix + f.slice(oldPrefix.length)))
        count++
      } catch (err: any) {
        log.error('[ImageCover] 迁移缓存失败:', err?.message)
      }
    }
  }
  return count
}

/** 删除目录中所有匹配前缀的缓存文件，返回删除数 */
function removeByPrefix(prefix: string): number {
  const dir = getCoverDir()
  if (!fs.existsSync(dir)) return 0
  let removed = 0
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(prefix)) continue
    try {
      fs.unlinkSync(path.join(dir, f))
      removed++
    } catch {
      // 并发删除等竞态可忽略
    }
  }
  return removed
}

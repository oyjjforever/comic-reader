import type { FolderInfo } from './file'

/**
 * 作品类型：comic=图片漫画文件夹 video=视频 image=单张图片 pdf/epub=文档 link=站点在线作品
 */
export type MediaKind = 'comic' | 'video' | 'image' | 'pdf' | 'epub' | 'link'

/**
 * 作品来源：local=本地库，其余为站点标识（missav/yfantasy/4khd...）
 */
export type MediaSource = 'local' | string

/**
 * 统一媒体条目：卡片展示与打开分发的唯一数据模型
 */
export interface MediaItem {
  /** 唯一键：本地=fullPath，站点=source+作品id */
  id: string
  kind: MediaKind
  source: MediaSource
  title: string
  /** 在线封面地址（站点作品） */
  coverUrl?: string
  /** 本地封面文件路径 */
  coverPath?: string
  /** 本地视频文件路径（用于生成缩略图与悬浮预览） */
  videoPath?: string
  /** 本地路径（文件夹或文件），打开阅读/播放用 */
  path?: string
  /** 页数/文件数角标 */
  fileCount?: number
  /** 本地条目状态：加载中/空内容不可打开 */
  state?: 'loading' | 'empty'
  /** 站点原始数据（跳转、下载用） */
  payload?: any
}

const VIDEO_EXTENSIONS = [
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.ogg',
  '.ogv'
]
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']

function extensionOf(p?: string): string {
  if (!p) return ''
  const i = p.lastIndexOf('.')
  return i === -1 ? '' : p.toLowerCase().substring(i)
}

/**
 * 判断路径是否为单张图片文件（书架散图）
 */
export function isImageFilePath(p?: string): boolean {
  return !!p && IMAGE_EXTENSIONS.includes(extensionOf(p))
}

function kindFromExtension(p?: string): MediaKind {
  const ext = extensionOf(p)
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.epub') return 'epub'
  return 'comic'
}

/**
 * 将本地库的 FolderInfo/FileInfo 归一化为 MediaItem。
 * 文件条目（FileInfo，带 extension 字段）按扩展名判定类型，阅读器走单文件模式；
 * 文件夹条目不论内容（图片/全视频/混合）一律按文件夹打开，阅读器内逐个展示播放。
 * 视频缩略图缓存 key 与旧版卡片保持一致（coverPath 优先）。
 */
export function toMediaItem(folder: FolderInfo, source: MediaSource = 'local'): MediaItem {
  const contentType = folder.contentType
  const isFileEntry = !!(folder as any).extension
  let kind: MediaKind
  if (isFileEntry) {
    kind = kindFromExtension(folder.fullPath)
  } else if (
    contentType === 'image' ||
    contentType === 'video' ||
    contentType === 'loading' ||
    contentType === 'empty'
  ) {
    // 文件夹作品（含全视频、加载中、空文件夹）：按文件夹模式打开
    kind = 'comic'
  } else if (contentType === 'pdf') {
    kind = 'pdf'
  } else if (contentType === 'epub' || contentType === 'ebook') {
    kind = 'epub'
  } else {
    kind = kindFromExtension(folder.fullPath)
  }

  const state =
    contentType === 'loading' ? 'loading' : contentType === 'empty' ? 'empty' : undefined

  // 混合内容文件夹（图+视频）的封面路径可能是视频文件（目录下无图片时取首个文件），
  // 此时交给卡片截帧生成封面，而不是把视频路径当图片加载
  const coverIsVideo = kind !== 'video' && kindFromExtension(folder.coverPath) === 'video'

  return {
    id: folder.fullPath,
    kind,
    source,
    title: folder.name,
    coverPath: kind === 'video' || coverIsVideo ? undefined : folder.coverPath,
    videoPath:
      kind === 'video'
        ? folder.coverPath || folder.fullPath
        : coverIsVideo
          ? folder.coverPath
          : undefined,
    path: folder.fullPath,
    fileCount: folder.fileCount,
    state
  }
}

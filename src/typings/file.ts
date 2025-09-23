/**
 * 文件夹内容类型
 */
export type FolderContentType = 'image' | 'pdf' | 'ebook' | 'mixed' | 'empty' | 'unknown'

/**
 * 文件夹信息接口
 */
export interface FolderInfo {
  /** 文件夹名称 */
  name: string
  /** 文件夹完整路径 */
  fullPath: string
  /** 创建时间 */
  createdTime?: Date
  /** 修改时间 */
  modifiedTime?: Date
  /** 内部文件个数（不包括子文件夹） */
  fileCount?: number
  /** 内部文件夹个数 */
  folderCount?: number
  /** 总项目数（文件+文件夹） */
  totalItems?: number
  /** 相对路径 */
  relativePath?: string
  /** 文件夹层级深度 */
  depth?: number
  /** 父文件夹路径（树形结构时使用） */
  parentPath?: string
  /** 子文件夹列表（树形结构时使用） */
  children?: FolderInfo[]
  /** 是否为叶子节点（最下级文件夹） */
  isLeaf?: boolean
  /** 文件夹内容类型 */
  contentType?: string,
  /** 是否被收藏 */
  isBookmarked?: boolean,
  /** 文件夹封面图路径 */
  coverPath?: string
}

/**
 * 文件信息接口
 */
export interface FileInfo {
  /** 文件名称 */
  name: string
  /** 文件完整路径 */
  fullPath: string
  /** 文件扩展名 */
  extension: string
  /** 创建时间 */
  createdTime: Date
  /** 修改时间 */
  modifiedTime: Date
  /** 文件大小（字节） */
  size: number
  /** 格式化的文件大小 */
  formattedSize: string
}

/**
 * 排序选项接口
 */
export interface SortOptions {
  /** 排序类型 */
  type: string
  /** 排序方向 */
  order: string
}
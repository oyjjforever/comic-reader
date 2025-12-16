// 设置类型
export type setting = {
    // 主题
    theme: 'auto' | 'light' | 'dark'
    // 书籍/文件排序
    bookSort: 'id ASC' | 'id DESC' | 'updated_at ASC' | 'updated_at DESC'
    // 资源路径
    resourcePath: string
    // 电影资源路径
    videoResourcePath: string
    // 默认下载路径（可选）
    defaultDownloadPath?: string
    // 站点专属下载路径（可选）
    downloadPathJmtt?: string
    downloadPathPixiv?: string
    downloadPathTwitter?: string
    // 是否启用更新检测
    enableAuthorUpdateCheck?: boolean
    // 默认展示标签页
    defaultViewMode?: 'folders' | 'favorites' | 'history'
}
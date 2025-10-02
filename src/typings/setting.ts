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
    // 文件夹返回数据类型
    folderStructureType: 'flat' | 'tree'
    // 默认下载路径（可选）
    defaultDownloadPath?: string
    // 第三方网页地址（可选）
    thirdPartyUrl?: string
}
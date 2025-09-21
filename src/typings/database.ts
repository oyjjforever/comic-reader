export type books = {
    id?: number, // ID
    name: string, // 书籍名字
    file_path: string, // 文件路径
    file_sha256: string, // 文件SHA256
    type: 'epub', // 文件类型
    cover?: string, // 封面
    author?: string, // 作者
    description?: string, // 描述
    progress: number, // 进度
    created_at?: number, // 创建时间
    updated_at?: number, // 更新时间
}

export type appData = {
    key: string, // 键
    value?: string, // 值
}

export type favorites = {
    id?: number, // ID
    fullPath: string, // 文件/文件夹完整路径
    created_at?: Date, // 创建时间
}
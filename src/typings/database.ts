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
    module: string, // 模块类型，例如'book'或'video'
    tags?: string, // 关联的标签ID，多个用逗号分隔，如"1,2,3"
    created_at?: Date, // 创建时间
}

export type tags = {
    id?: number, // ID
    label: string, // 标签名称
    type?: 'normal' | 'folder', // 标签类型：普通标签或文件夹标签
    folderPath?: string, // 文件夹路径（仅对文件夹标签有效）
    namespace?: string, // 命名空间，用于区分不同模块的标签集合
    created_at?: Date, // 创建时间
}
// 设置类型
export type setting = {
    theme: 'auto' | 'light' | 'dark' // 主题
    bookSort: 'id ASC' | 'id DESC' | 'updated_at ASC' | 'updated_at DESC' // 书籍排序
    resourcePath: string // 资源路径
    folderStructureType: 'flat' | 'tree' // 文件夹返回数据类型
}
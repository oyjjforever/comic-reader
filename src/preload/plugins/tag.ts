import { tags } from "@/typings/database";
import { Database } from 'sqlite'
import database from "./sqlite";

// 打开数据库
let db: Database | null = null;

/**
 * @description: 获取所有标签
 * @param {string} order 排序方式，例如`id DESC, id ASC`
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<tags[]>} 返回标签列表
 */
const getTags = async (order?: string, namespace?: string): Promise<tags[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    if (!order) {
        order = 'id DESC'
    }

    let sql = `SELECT * FROM tags`
    const params: any[] = []
    
    if (namespace) {
        sql += ` WHERE namespace = ?`
        params.push(namespace)
    }
    
    sql += ` ORDER BY ${order}`
    return await db.all<tags[]>(sql, ...params)
}

/**
 * @description: 根据ID获取单个标签
 * @param {number} id 标签ID
 * @return {Promise<tags>} 返回标签信息
 */
const getTag = async (id: number): Promise<tags> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const tag = await db.get<tags>('SELECT * FROM tags WHERE id = ?', id)

        if (!tag) {
            throw new Error('标签不存在')
        }

        return tag
    } catch (error) {
        throw error
    }
}

/**
 * @description: 根据标签名称获取标签
 * @param {string} label 标签名称
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<tags | null>} 返回标签信息或null
 */
const getTagByLabel = async (label: string, namespace?: string): Promise<tags | null> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        let sql = 'SELECT * FROM tags WHERE label = ?'
        const params: any[] = [label]
        
        if (namespace) {
            sql += ` AND namespace = ?`
            params.push(namespace)
        }
        
        const tag = await db.get<tags>(sql, ...params)
        return tag || null
    } catch (error) {
        throw error
    }
}

/**
 * @description: 添加标签
 * @param {string} label 标签名称
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<number>} 返回标签ID
 */
const addTag = async (label: string, namespace?: string): Promise<number> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 使用默认命名空间如果没有提供
        const tagNamespace = namespace || 'default'
        
        // 检查标签是否已存在
        const existingTag = await getTagByLabel(label, tagNamespace)
        if (existingTag) {
            throw new Error('该标签已存在')
        }

        const result = await db.run(`
            INSERT INTO tags (label, type, namespace, created_at)
            VALUES (?, 'normal', ?, ?)
        `, label, tagNamespace, new Date())

        if (!result.lastID) {
            throw new Error('添加标签失败')
        }

        return result.lastID
    } catch (error) {
        throw error
    }
}

/**
 * @description: 添加文件夹标签
 * @param {string} label 标签名称
 * @param {string} folderPath 文件夹路径
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<number>} 返回标签ID
 */
const addFolderTag = async (label: string, folderPath: string, namespace?: string): Promise<number> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 使用默认命名空间如果没有提供
        const tagNamespace = namespace || 'default'
        
        // 检查标签是否已存在
        const existingTag = await getTagByLabel(label, tagNamespace)
        if (existingTag) {
            throw new Error('该标签已存在')
        }

        // 检查文件夹路径是否已被用作标签
        const existingFolderTag = await db.get<tags>('SELECT * FROM tags WHERE folderPath = ? AND namespace = ?', folderPath, tagNamespace)
        if (existingFolderTag) {
            throw new Error('该文件夹已被收藏为标签')
        }

        const result = await db.run(`
            INSERT INTO tags (label, type, folderPath, namespace, created_at)
            VALUES (?, 'folder', ?, ?, ?)
        `, label, folderPath, tagNamespace, new Date())

        if (!result.lastID) {
            throw new Error('添加文件夹标签失败')
        }

        return result.lastID
    } catch (error) {
        throw error
    }
}

/**
 * @description: 根据文件夹路径获取标签
 * @param {string} folderPath 文件夹路径
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<tags | null>} 返回标签信息或null
 */
const getTagByFolderPath = async (folderPath: string, namespace?: string): Promise<tags | null> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        let sql = 'SELECT * FROM tags WHERE folderPath = ?'
        const params: any[] = [folderPath]
        
        if (namespace) {
            sql += ` AND namespace = ?`
            params.push(namespace)
        }
        
        const tag = await db.get<tags>(sql, ...params)
        return tag || null
    } catch (error) {
        throw error
    }
}

/**
 * @description: 获取所有文件夹标签
 * @param {string} order 排序方式，例如`id DESC, id ASC`
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<tags[]>} 返回文件夹标签列表
 */
const getFolderTags = async (order?: string, namespace?: string): Promise<tags[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    if (!order) {
        order = 'id DESC'
    }

    let sql = `SELECT * FROM tags WHERE type = 'folder'`
    const params: any[] = []
    
    if (namespace) {
        sql += ` AND namespace = ?`
        params.push(namespace)
    }
    
    sql += ` ORDER BY ${order}`
    return await db.all<tags[]>(sql, ...params)
}

/**
 * @description: 获取所有普通标签
 * @param {string} order 排序方式，例如`id DESC, id ASC`
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<tags[]>} 返回普通标签列表
 */
const getNormalTags = async (order?: string, namespace?: string): Promise<tags[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    if (!order) {
        order = 'id DESC'
    }

    let sql = `SELECT * FROM tags WHERE type = 'normal'`
    const params: any[] = []
    
    if (namespace) {
        sql += ` AND namespace = ?`
        params.push(namespace)
    }
    
    sql += ` ORDER BY ${order}`
    return await db.all<tags[]>(sql, ...params)
}

/**
 * @description: 检查路径是否已被收藏为标签
 * @param {string} folderPath 文件夹路径
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<boolean>} 返回是否已被收藏为标签
 */
const isFolderTagged = async (folderPath: string, namespace?: string): Promise<boolean> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        let sql = 'SELECT * FROM tags WHERE folderPath = ?'
        const params: any[] = [folderPath]
        
        if (namespace) {
            sql += ` AND namespace = ?`
            params.push(namespace)
        }
        
        const tag = await db.get<tags>(sql, ...params)
        return !!tag
    } catch (error) {
        throw error
    }
}

/**
 * @description: 更新标签
 * @param {number} id 标签ID
 * @param {string} label 新的标签名称
 * @return {Promise<void>} 返回更新结果
 */
const updateTag = async (id: number, label: string): Promise<void> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 检查标签是否存在
        const existingTag = await getTag(id)
        if (!existingTag) {
            throw new Error('标签不存在')
        }

        // 获取当前标签信息以获取namespace
        const currentTag = await getTag(id)
        if (!currentTag) {
            throw new Error('标签不存在')
        }
        
        // 检查新标签名称是否已被其他标签使用
        const tagWithSameLabel = await getTagByLabel(label, currentTag.namespace)
        if (tagWithSameLabel && tagWithSameLabel.id !== id) {
            throw new Error('该标签名称已被使用')
        }

        const result = await db.run('UPDATE tags SET label = ? WHERE id = ?', label, id)

        if (!result.changes) {
            throw new Error('更新标签失败')
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 删除标签
 * @param {number} id 标签ID
 * @return {Promise<void>} 返回删除结果
 */
const deleteTag = async (id: number): Promise<void> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 检查标签是否存在
        const existingTag = await getTag(id)
        if (!existingTag) {
            throw new Error('标签不存在')
        }

        // 获取当前标签信息以获取namespace
        const currentTag = await getTag(id)
        if (!currentTag) {
            throw new Error('标签不存在')
        }
        
        // 获取所有使用该标签的收藏
        const favoritesWithThisTag = await db.all<{ id: number, tags: string, module: string }[]>('SELECT id, tags, module FROM favorites WHERE tags LIKE ?', `%${id}%`)

        // 从所有收藏中移除该标签ID
        for (const favorite of favoritesWithThisTag) {
            if (favorite.tags) {
                const tagIds = favorite.tags.split(',').filter(tagId => tagId.trim() !== '' && tagId !== id.toString())
                const newTags = tagIds.join(',')
                await db.run('UPDATE favorites SET tags = ? WHERE id = ?', newTags, favorite.id)
            }
        }

        // 删除标签
        const result = await db.run('DELETE FROM tags WHERE id = ?', id)

        if (!result.changes) {
            throw new Error('删除标签失败')
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 获取标签数量
 * @return {Promise<number>} 返回标签总数
 */
const getTagCount = async (): Promise<number> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const result = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tags')
        return result?.count || 0
    } catch (error) {
        throw error
    }
}

/**
 * @description: 根据ID数组获取标签列表
 * @param {string} ids 标签ID字符串，以逗号分隔
 * @param {string} namespace 命名空间，用于区分不同模块的标签集合
 * @return {Promise<tags[]>} 返回标签列表
 */
const getTagsByIds = async (ids: string, namespace?: string): Promise<tags[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    if (!ids || ids.trim() === '') {
        return []
    }

    try {
        // 将字符串转换为数字数组
        const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))

        if (idArray.length === 0) {
            return []
        }

        const placeholders = idArray.map(() => '?').join(',')
        let sql = `SELECT * FROM tags WHERE id IN (${placeholders})`
        const params: any[] = [...idArray]
        
        if (namespace) {
            sql += ` AND namespace = ?`
            params.push(namespace)
        }
        
        sql += ` ORDER BY id`
        return await db.all<tags[]>(sql, ...params)
    } catch (error) {
        throw error
    }
}

export default {
    getTags,
    getTag,
    getTagByLabel,
    addTag,
    addFolderTag,
    getTagByFolderPath,
    getFolderTags,
    getNormalTags,
    isFolderTagged,
    updateTag,
    deleteTag,
    getTagCount,
    getTagsByIds,
}
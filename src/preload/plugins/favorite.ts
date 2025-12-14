import { favorites, tags } from "@/typings/database";
import { Database } from 'sqlite'
import database from "./sqlite";
import tagPlugin from "./tag";

// 打开数据库
let db: Database | null = null;
/**
 * @description: 读取全部收藏
 * @param {string} order 排序方式，例如`id DESC, id ASC`
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<favorites[]>} 返回收藏列表
 */
const getFavorites = async (order?: string, module?: string): Promise<favorites[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    if (!order) {
        order = 'id DESC'
    }

    let sql = 'SELECT * FROM favorites'
    const params: any[] = []

    if (module) {
        sql += ' WHERE module = ?'
        params.push(module)
    }

    sql += ` ORDER BY ${order}`

    return await db.all<favorites[]>(sql, ...params)
}

/**
 * @description: 读取单个收藏
 * @param {number} id 收藏ID
 * @return {Promise<favorites>} 返回收藏信息
 */
const getFavorite = async (id: number): Promise<favorites> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const favorite = await db.get<favorites>('SELECT * FROM favorites WHERE id = ?', id)

        if (!favorite) {
            throw new Error('收藏不存在')
        }

        return favorite
    } catch (error) {
        throw error
    }
}

/**
 * @description: 检查路径是否已收藏
 * @param {string} fullPath 文件/文件夹完整路径
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<boolean>} 返回是否已收藏
 */
const isFavorited = async (fullPath: string, module: string): Promise<boolean> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const favorite = await db.get<favorites>('SELECT * FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)
        return !!favorite
    } catch (error) {
        throw error
    }
}

/**
 * @description: 添加收藏
 * @param {string} fullPath 文件/文件夹完整路径
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<number>} 返回收藏ID
 */
const addFavorite = async (fullPath: string, module: string, tagIds?: string): Promise<number> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 检查是否已收藏
        const existingFavorite = await db.get<favorites>('SELECT * FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)
        if (existingFavorite) {
            throw new Error('该路径已收藏')
        }
        const result = await db.run(`
            INSERT INTO favorites (fullPath, module, tags, created_at)
            VALUES (?, ?, ?, ?)
        `, fullPath, module, tagIds, new Date())

        if (!result.lastID) {
            throw new Error('添加收藏失败')
        }

        return result.lastID
    } catch (error) {
        throw error
    }
}

/**
 * @description: 删除收藏（通过ID）
 * @param {number} id 收藏ID
 * @return {Promise<void>} 返回删除结果
 */
const deleteFavorite = async (id: number): Promise<void> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const result = await db.run('DELETE FROM favorites WHERE id = ?', id)

        if (!result.changes) {
            throw new Error('删除收藏失败')
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 删除收藏（通过路径）
 * @param {string} fullPath 文件/文件夹完整路径
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<void>} 返回删除结果
 */
const deleteFavoriteByPath = async (fullPath: string, module: string): Promise<void> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const result = await db.run('DELETE FROM favorites WHERE fullPath = ? AND module = ?', fullPath, module)

        if (!result.changes) {
            throw new Error('删除收藏失败')
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 切换收藏状态（如果已收藏则删除，未收藏则添加）
 * @param {string} fullPath 文件/文件夹完整路径
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<boolean>} 返回操作后的收藏状态（true表示已收藏，false表示已取消收藏）
 */
const toggleFavorite = async (fullPath: string, module: string): Promise<boolean> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const isCurrentlyFavorited = await isFavorited(fullPath, module)
        console.log('isCurrentlyFavorited', fullPath, module, isCurrentlyFavorited)
        if (isCurrentlyFavorited) {
            await deleteFavoriteByPath(fullPath, module)
            return false
        } else {
            await addFavorite(fullPath, module)
            return true
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 获取收藏数量
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<number>} 返回收藏总数
 */
const getFavoriteCount = async (module?: string): Promise<number> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        let sql = 'SELECT COUNT(*) as count FROM favorites'
        const params: any[] = []

        if (module) {
            sql += ' WHERE module = ?'
            params.push(module)
        }

        const result = await db.get<{ count: number }>(sql, ...params)
        return result?.count || 0
    } catch (error) {
        throw error
    }
}

/**
 * @description: 更新收藏的标签
 * @param {number} id 收藏ID
 * @param {string} tagIds 标签ID数组
 * @return {Promise<void>} 返回更新结果
 */
const updateFavoriteTags = async (id: number, tagIds: string): Promise<void> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 检查收藏是否存在
        const existingFavorite = await getFavorite(id)
        if (!existingFavorite) {
            throw new Error('收藏不存在')
        }

        const result = await db.run('UPDATE favorites SET tags = ? WHERE id = ?', tagIds, id)

        if (!result.changes) {
            throw new Error('更新收藏标签失败')
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 获取收藏的标签
 * @param {number} id 收藏ID
 * @return {Promise<tags[]>} 返回标签列表
 */
const getFavoriteTags = async (id: number): Promise<tags[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 检查收藏是否存在
        const existingFavorite = await getFavorite(id)
        if (!existingFavorite) {
            throw new Error('收藏不存在')
        }

        // 如果收藏没有标签，返回空数组
        if (!existingFavorite.tags) {
            return []
        }

        // 将标签ID字符串转换为数字数组
        const tagIds = existingFavorite.tags.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))

        // 获取标签详情
        return await tagPlugin.getTagsByIds(tagIds)
    } catch (error) {
        throw error
    }
}

/**
 * @description: 根据标签ID获取收藏列表
 * @param {string} tagIds 标签ID数组
 * @param {string} order 排序方式，例如`id DESC, id ASC`
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<favorites[]>} 返回收藏列表
 */
const getFavoritesByTags = async (tagIdstr: string, order?: string, module?: string): Promise<favorites[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    if (!order) {
        order = 'id DESC'
    }
    const tagIds = tagIdstr.split(',')
    if (tagIds.length === 0) {
        return []
    }

    try {
        let sql = 'SELECT * FROM favorites WHERE '
        const params: any[] = []

        // 为每个标签ID创建一个LIKE条件
        const tagConditions = tagIds.map(() => 'tags LIKE ?').join(' OR ')
        sql += tagConditions

        // 添加模块过滤条件
        if (module) {
            sql += ' AND module = ?'
            params.push(module)
        }

        sql += ` ORDER BY ${order}`

        // 为每个标签ID添加参数
        tagIds.forEach(tagId => {
            params.push(`%${tagId}%`)
        })

        const results = await db.all<favorites[]>(sql, ...params)

        // 进一步过滤结果，确保收藏包含所有指定的标签
        return results.filter(favorite => {
            if (!favorite.tags) return false

            const favoriteTagIds = favorite.tags.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
            return tagIds.every(tagId => favoriteTagIds.includes(tagId))
        })
    } catch (error) {
        throw error
    }
}

export default {
    getFavorites,
    getFavorite,
    isFavorited,
    addFavorite,
    deleteFavorite,
    deleteFavoriteByPath,
    toggleFavorite,
    getFavoriteCount,
    updateFavoriteTags,
    getFavoriteTags,
    getFavoritesByTags,
}
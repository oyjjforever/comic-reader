import { favorites } from "@/typings/database";
import database from "./sqlite";

// 打开数据库
let db = await database.openDatabase()

/**
 * @description: 读取全部收藏
 * @param {string} order 排序方式，例如`id DESC, id ASC`
 * @return {Promise<favorites[]>} 返回收藏列表
 */
const getFavorites = async (order?: string): Promise<favorites[]> => {
    if (!db) {
        throw new Error('数据库初始化失败')
    }

    if (!order) {
        order = 'id DESC'
    }

    return await db.all<favorites[]>(`
        SELECT * FROM favorites 
        ORDER BY ${order}
    `)
}

/**
 * @description: 读取单个收藏
 * @param {number} id 收藏ID
 * @return {Promise<favorites>} 返回收藏信息
 */
const getFavorite = async (id: number): Promise<favorites> => {
    if (!db) {
        throw new Error('数据库初始化失败')
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
 * @return {Promise<boolean>} 返回是否已收藏
 */
const isFavorited = async (fullPath: string): Promise<boolean> => {
    if (!db) {
        throw new Error('数据库初始化失败')
    }

    try {
        const favorite = await db.get<favorites>('SELECT * FROM favorites WHERE fullPath = ?', fullPath)
        return !!favorite
    } catch (error) {
        throw error
    }
}

/**
 * @description: 添加收藏
 * @param {string} fullPath 文件/文件夹完整路径
 * @return {Promise<number>} 返回收藏ID
 */
const addFavorite = async (fullPath: string): Promise<number> => {
    if (!db) {
        throw new Error('数据库初始化失败')
    }

    try {
        // 检查是否已收藏
        const existingFavorite = await db.get<favorites>('SELECT * FROM favorites WHERE fullPath = ?', fullPath)
        if (existingFavorite) {
            throw new Error('该路径已收藏')
        }

        const result = await db.run(`
            INSERT INTO favorites (fullPath, created_at)
            VALUES (?, ?)
        `, fullPath, new Date())

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
        throw new Error('数据库初始化失败')
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
 * @return {Promise<void>} 返回删除结果
 */
const deleteFavoriteByPath = async (fullPath: string): Promise<void> => {
    if (!db) {
        throw new Error('数据库初始化失败')
    }

    try {
        const result = await db.run('DELETE FROM favorites WHERE fullPath = ?', fullPath)

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
 * @return {Promise<boolean>} 返回操作后的收藏状态（true表示已收藏，false表示已取消收藏）
 */
const toggleFavorite = async (fullPath: string): Promise<boolean> => {
    if (!db) {
        throw new Error('数据库初始化失败')
    }

    try {
        const isCurrentlyFavorited = await isFavorited(fullPath)
        console.log('isCurrentlyFavorited', fullPath, isCurrentlyFavorited)
        if (isCurrentlyFavorited) {
            await deleteFavoriteByPath(fullPath)
            return false
        } else {
            await addFavorite(fullPath)
            return true
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 获取收藏数量
 * @return {Promise<number>} 返回收藏总数
 */
const getFavoriteCount = async (): Promise<number> => {
    if (!db) {
        throw new Error('数据库初始化失败')
    }

    try {
        const result = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM favorites')
        return result?.count || 0
    } catch (error) {
        throw error
    }
}

const favoriteManagement = {
    getFavorites,
    getFavorite,
    isFavorited,
    addFavorite,
    deleteFavorite,
    deleteFavoriteByPath,
    toggleFavorite,
    getFavoriteCount,
}

export default favoriteManagement
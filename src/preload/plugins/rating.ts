import { ratings } from "@/typings/database";
import { Database } from 'sqlite'
import database from "./sqlite";

let db: Database | null = null;

async function getDb(): Promise<Database> {
    if (!db) {
        db = await database.openDatabase()
    }
    return db
}

/**
 * @description: 获取单个作品评分
 * @param {string} fullPath 文件/文件夹完整路径
 * @param {string} module 模块类型，例如'book'或'video'
 * @return {Promise<number>} 返回评分（0-5），未评分返回0
 */
const getRating = async (fullPath: string, module: string): Promise<number> => {
    const database = await getDb()
    try {
        const row = await database.get<ratings>(
            'SELECT * FROM ratings WHERE fullPath = ? AND module = ?',
            fullPath, module
        )
        return row?.rating || 0
    } catch (error) {
        throw error
    }
}

/**
 * @description: 批量获取评分（用于列表加载）
 * @param {string} module 模块类型
 * @return {Promise<Map<string, number>>} 返回 fullPath -> rating 的映射
 */
const getAllRatings = async (module: string): Promise<Record<string, number>> => {
    const database = await getDb()
    try {
        const rows = await database.all<ratings[]>(
            'SELECT * FROM ratings WHERE module = ?',
            module
        )
        const map: Record<string, number> = {}
        for (const row of rows) {
            map[row.fullPath] = row.rating
        }
        return map
    } catch (error) {
        throw error
    }
}

/**
 * @description: 设置评分（不存在则新增，存在则更新）
 * @param {string} fullPath 文件/文件夹完整路径
 * @param {string} module 模块类型
 * @param {number} rating 评分（0-5）
 * @return {Promise<void>}
 */
const setRating = async (fullPath: string, module: string, rating: number): Promise<void> => {
    const database = await getDb()
    const now = new Date()
    try {
        await database.run(`
            INSERT INTO ratings (fullPath, module, rating, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(fullPath, module) DO UPDATE SET
                rating = excluded.rating,
                updated_at = excluded.updated_at
        `, fullPath, module, rating, now, now)
    } catch (error) {
        throw error
    }
}

/**
 * @description: 删除评分
 * @param {string} fullPath 文件/文件夹完整路径
 * @param {string} module 模块类型
 * @return {Promise<void>}
 */
const deleteRating = async (fullPath: string, module: string): Promise<void> => {
    const database = await getDb()
    try {
        await database.run(
            'DELETE FROM ratings WHERE fullPath = ? AND module = ?',
            fullPath, module
        )
    } catch (error) {
        throw error
    }
}

export default {
    getRating,
    getAllRatings,
    setRating,
    deleteRating,
}

import sqlite from './sqlite'
import type { downloadHistory } from '../../typings/database'

/**
 * 添加下载历史记录
 * @param fullPath 文件/文件夹完整路径
 * @param module 模块类型，例如'jmtt'、'pixiv'或'twitter'
 * @returns Promise<boolean> 是否添加成功
 */
const addDownloadHistory = async (fullPath: string, module: string): Promise<boolean> => {
    try {
        const db = await sqlite.openDatabase()
        const now = new Date().toISOString()

        // 先检查是否已存在相同路径的记录，如果存在则更新时间
        const existingRecord = await db.get<downloadHistory>(
            'SELECT * FROM download_history WHERE fullPath = ? AND module = ?',
            [fullPath, module]
        )

        if (existingRecord) {
            // 更新现有记录的时间
            await db.run(
                'UPDATE download_history SET created_at = ? WHERE id = ?',
                [now, existingRecord.id]
            )
        } else {
            // 插入新记录
            await db.run(
                'INSERT INTO download_history (fullPath, module, created_at) VALUES (?, ?, ?)',
                [fullPath, module, now]
            )
        }

        // 清理超过100条的记录
        await cleanupOldDownloadHistory()

        return true
    } catch (error) {
        console.error('添加下载历史失败:', error)
        return false
    }
}

/**
 * 获取下载历史记录
 * @param limit 限制返回的记录数量，默认100
 * @param module 可选，指定模块类型过滤，例如'jmtt'、'pixiv'或'twitter'
 * @returns Promise<downloadHistory[]> 下载历史记录列表
 */
const getDownloadHistory = async (limit: number = 100, module?: string): Promise<downloadHistory[]> => {
    try {
        const db = await sqlite.openDatabase()
        let query = 'SELECT * FROM download_history ORDER BY created_at DESC LIMIT ?'
        let params: any[] = [limit]

        // 如果指定了模块类型，添加过滤条件
        if (module) {
            query = 'SELECT * FROM download_history WHERE module = ? ORDER BY created_at DESC LIMIT ?'
            params = [module, limit]
        }

        const history = await db.all<downloadHistory[]>(query, params)
        return history
    } catch (error) {
        console.error('获取下载历史失败:', error)
        return []
    }
}

/**
 * 删除下载历史记录
 * @param id 记录ID
 * @returns Promise<boolean> 是否删除成功
 */
const deleteDownloadHistory = async (id: number): Promise<boolean> => {
    try {
        const db = await sqlite.openDatabase()
        const result = await db.run('DELETE FROM download_history WHERE id = ?', [id])
        return (result.changes || 0) > 0
    } catch (error) {
        console.error('删除下载历史失败:', error)
        return false
    }
}

/**
 * 清空所有下载历史记录
 * @returns Promise<boolean> 是否清空成功
 */
const clearDownloadHistory = async (): Promise<boolean> => {
    try {
        const db = await sqlite.openDatabase()
        await db.run('DELETE FROM download_history')
        return true
    } catch (error) {
        console.error('清空下载历史失败:', error)
        return false
    }
}

/**
 * 清理超过100条的旧记录
 * @returns Promise<void>
 */
const cleanupOldDownloadHistory = async (): Promise<void> => {
    try {
        const db = await sqlite.openDatabase()

        // 获取总记录数
        const countResult = await db.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM download_history'
        )
        const totalCount = countResult?.count || 0

        // 如果超过100条，删除最旧的记录
        if (totalCount > 100) {
            const deleteCount = totalCount - 100
            await db.run(
                `DELETE FROM download_history 
         WHERE id IN (
           SELECT id FROM download_history 
           ORDER BY created_at ASC 
           LIMIT ?
         )`,
                [deleteCount]
            )
        }
    } catch (error) {
        console.error('清理旧下载历史失败:', error)
    }
}

export default {
    addDownloadHistory,
    getDownloadHistory,
    deleteDownloadHistory,
    clearDownloadHistory,
    cleanupOldDownloadHistory
}
import sqlite from './sqlite'
import appData from './appData'
import type { browseHistory } from '../../typings/database'

/**
 * 从设置中读取浏览历史最大条数
 * @returns Promise<number> 最大条数，默认100
 */
const getMaxHistoryCount = async (): Promise<number> => {
    try {
        const settingStr = await appData.get('setting')
        if (settingStr) {
            const settingData = JSON.parse(settingStr)
            const count = Number(settingData.historyMaxCount)
            if (Number.isFinite(count) && count > 0) {
                return count
            }
        }
    } catch (error) {
        console.error('读取浏览历史最大条数设置失败:', error)
    }
    return 100
}

/**
 * 添加浏览历史记录
 * @param fullPath 文件/文件夹完整路径
 * @param module 模块类型，例如'book'或'video'
 * @returns Promise<boolean> 是否添加成功
 */
const addBrowseHistory = async (fullPath: string, module: string): Promise<boolean> => {
    try {
        const db = await sqlite.openDatabase()
        const now = new Date().toISOString()

        // 先检查是否已存在相同路径的记录，如果存在则更新时间
        const existingRecord = await db.get<browseHistory>(
            'SELECT * FROM browse_history WHERE fullPath = ? AND module = ?',
            [fullPath, module]
        )

        if (existingRecord) {
            // 更新现有记录的时间
            await db.run(
                'UPDATE browse_history SET created_at = ? WHERE id = ?',
                [now, existingRecord.id]
            )
        } else {
            // 插入新记录
            await db.run(
                'INSERT INTO browse_history (fullPath, module, created_at) VALUES (?, ?, ?)',
                [fullPath, module, now]
            )
        }

        // 清理超过100条的记录
        await cleanupOldHistory()

        return true
    } catch (error) {
        console.error('添加浏览历史失败:', error)
        return false
    }
}

/**
 * 获取浏览历史记录
 * @param limit 限制返回的记录数量，默认100
 * @param module 可选，指定模块类型过滤，例如'book'或'video'
 * @returns Promise<browseHistory[]> 浏览历史记录列表
 */
const getBrowseHistory = async (limit: number = 100, module?: string): Promise<browseHistory[]> => {
    try {
        const db = await sqlite.openDatabase()
        let query = 'SELECT * FROM browse_history ORDER BY created_at DESC LIMIT ?'
        let params: any[] = [limit]

        // 如果指定了模块类型，添加过滤条件
        if (module) {
            query = 'SELECT * FROM browse_history WHERE module = ? ORDER BY created_at DESC LIMIT ?'
            params = [module, limit]
        }

        const history = await db.all<browseHistory[]>(query, params)
        return history
    } catch (error) {
        console.error('获取浏览历史失败:', error)
        return []
    }
}

/**
 * 删除浏览历史记录
 * @param id 记录ID
 * @returns Promise<boolean> 是否删除成功
 */
const deleteBrowseHistory = async (id: number): Promise<boolean> => {
    try {
        const db = await sqlite.openDatabase()
        const result = await db.run('DELETE FROM browse_history WHERE id = ?', [id])
        return (result.changes || 0) > 0
    } catch (error) {
        console.error('删除浏览历史失败:', error)
        return false
    }
}

/**
 * 清空所有浏览历史记录
 * @param module 可选，指定模块类型，例如'book'或'video'
 * @returns Promise<boolean> 是否清空成功
 */
const clearBrowseHistory = async (module?: string): Promise<boolean> => {
    try {
        const db = await sqlite.openDatabase()
        let query = 'DELETE FROM browse_history'
        let params: any[] = []
        
        if (module) {
            query += ' WHERE module = ?'
            params.push(module)
        }
        
        await db.run(query, params)
        return true
    } catch (error) {
        console.error('清空浏览历史失败:', error)
        return false
    }
}

/**
 * 清理超过最大条数的旧记录
 * @param maxCount 可选，最大条数，不传则从设置中读取
 * @returns Promise<void>
 */
const cleanupOldHistory = async (maxCountParam?: number): Promise<void> => {
    try {
        const db = await sqlite.openDatabase()

        // 获取最大条数设置
        const maxCount = maxCountParam && maxCountParam > 0 ? maxCountParam : await getMaxHistoryCount()

        // 获取总记录数
        const countResult = await db.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM browse_history'
        )
        const totalCount = countResult?.count || 0

        // 如果超过最大条数，删除最旧的记录
        if (totalCount > maxCount) {
            const deleteCount = totalCount - maxCount
            await db.run(
                `DELETE FROM browse_history 
         WHERE id IN (
           SELECT id FROM browse_history 
           ORDER BY created_at ASC 
           LIMIT ?
         )`,
                [deleteCount]
            )
        }
    } catch (error) {
        console.error('清理旧浏览历史失败:', error)
    }
}

export default {
    addBrowseHistory,
    getBrowseHistory,
    deleteBrowseHistory,
    clearBrowseHistory,
    cleanupOldHistory
}
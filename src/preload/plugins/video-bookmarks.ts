import { Database } from 'sqlite'
import database from "./sqlite";

// 视频书签接口定义
export interface VideoBookmark {
    id?: number;
    video_path: string;
    time_point: number;
    title?: string;
    description?: string;
    created_at: string;
}

// 打开数据库
let db: Database | null = null;

/**
 * @description: 获取指定视频的所有时间点收藏
 * @param {string} videoPath 视频文件路径
 * @param {string} order 排序方式，例如`time_point ASC, time_point DESC`
 * @return {Promise<VideoBookmark[]>} 返回时间点收藏列表
 */
const getVideoBookmarks = async (videoPath: string, order?: string): Promise<VideoBookmark[]> => {
    if (!db) {
        db = await database.openDatabase()
    }

    if (!order) {
        order = 'time_point ASC'
    }

    return await db.all<VideoBookmark[]>(`
        SELECT * FROM video_bookmarks 
        WHERE video_path = ?
        ORDER BY ${order}
    `, videoPath)
}

/**
 * @description: 添加视频时间点收藏
 * @param {string} videoPath 视频文件路径
 * @param {number} timePoint 时间点（秒）
 * @param {string} title 收藏标题（可选）
 * @param {string} description 收藏描述（可选）
 * @return {Promise<number>} 返回收藏ID
 */
const addVideoBookmark = async (
    videoPath: string, 
    timePoint: number, 
    title?: string, 
    description?: string
): Promise<number> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        // 检查是否已存在相同时间点的收藏
        const existingBookmark = await db.get<VideoBookmark>(
            'SELECT * FROM video_bookmarks WHERE video_path = ? AND time_point = ?', 
            videoPath, 
            timePoint
        )
        
        if (existingBookmark) {
            throw new Error('该时间点已收藏')
        }

        const result = await db.run(`
            INSERT INTO video_bookmarks (video_path, time_point, title, description, created_at)
            VALUES (?, ?, ?, ?, ?)
        `, videoPath, timePoint, title, description, new Date().toISOString())

        if (!result.lastID) {
            throw new Error('添加时间点收藏失败')
        }

        return result.lastID
    } catch (error) {
        throw error
    }
}

/**
 * @description: 删除视频时间点收藏
 * @param {number} id 收藏ID
 * @return {Promise<void>} 返回删除结果
 */
const deleteVideoBookmark = async (id: number): Promise<void> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const result = await db.run('DELETE FROM video_bookmarks WHERE id = ?', id)

        if (!result.changes) {
            throw new Error('删除时间点收藏失败')
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 更新视频时间点收藏信息
 * @param {number} id 收藏ID
 * @param {string} title 新标题
 * @param {string} description 新描述
 * @return {Promise<void>} 返回更新结果
 */
const updateVideoBookmark = async (id: number, title?: string, description?: string): Promise<void> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const result = await db.run(`
            UPDATE video_bookmarks 
            SET title = ?, description = ?
            WHERE id = ?
        `, title, description, id)

        if (!result.changes) {
            throw new Error('更新时间点收藏失败')
        }
    } catch (error) {
        throw error
    }
}

/**
 * @description: 获取视频时间点收藏数量
 * @param {string} videoPath 视频文件路径
 * @return {Promise<number>} 返回收藏总数
 */
const getVideoBookmarkCount = async (videoPath: string): Promise<number> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const result = await db.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM video_bookmarks WHERE video_path = ?', 
            videoPath
        )
        return result?.count || 0
    } catch (error) {
        throw error
    }
}

/**
 * @description: 检查指定时间点是否已收藏
 * @param {string} videoPath 视频文件路径
 * @param {number} timePoint 时间点（秒）
 * @return {Promise<boolean>} 返回是否已收藏
 */
const isTimePointBookmarked = async (videoPath: string, timePoint: number): Promise<boolean> => {
    if (!db) {
        db = await database.openDatabase()
    }

    try {
        const bookmark = await db.get<VideoBookmark>(
            'SELECT * FROM video_bookmarks WHERE video_path = ? AND time_point = ?', 
            videoPath, 
            timePoint
        )
        return !!bookmark
    } catch (error) {
        throw error
    }
}

export default {
    getVideoBookmarks,
    addVideoBookmark,
    deleteVideoBookmark,
    updateVideoBookmark,
    getVideoBookmarkCount,
    isTimePointBookmarked,
}
import sqlite3 from 'sqlite3'
import { Database, open } from 'sqlite'
import fs from 'fs'
import path from 'path'
import os from 'os'

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null

/**
 * @description: 打开数据库，并保存链接到全局变量
 * @return {Promise<void>} Promise
 */
const openDatabase = (): Promise<Database<sqlite3.Database, sqlite3.Statement>> => {
    return new Promise(async (resolve, reject) => {
        // 计算用户数据目录，并确保存在（优先使用 Windows 的 %APPDATA%/漫画阅读器；其它平台使用 ~/<.comic-reader>）
        const productName = '漫画阅读器'
        const appDataDir =
            process.platform === 'win32'
                ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), productName)
                : path.join(os.homedir(), '.comic-reader')

        if (!fs.existsSync(appDataDir)) {
            fs.mkdirSync(appDataDir, { recursive: true })
        }
        const dbPath = path.join(appDataDir, 'database.db')

        try {
            db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            })

            createTable()

            resolve(db)
        } catch (error) {
            reject(error)
        }
    })
}

/**
 * @description: 创建表
 */
const createTable = () => {
    // 创建App数据表
    db?.exec(`
        CREATE TABLE IF NOT EXISTS app_data (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `)

    // 创建收藏表
    db?.exec(`
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fullPath TEXT NOT NULL UNIQUE,
            module TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    `)

    // 创建视频时间点收藏表
    db?.exec(`
        CREATE TABLE IF NOT EXISTS video_bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_path TEXT NOT NULL,
            time_point REAL NOT NULL,
            title TEXT,
            description TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(video_path, time_point)
        )
    `)
}

export default {
    openDatabase,
}
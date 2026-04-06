import sqlite3 from 'sqlite3'
import { Database, open } from 'sqlite'
import fs from 'fs'
import path from 'path'
import os from 'os'
import log from '../utils/log'

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null

/**
 * 获取数据库连接（单例模式，复用 preload 的同一数据库文件）
 */
export async function getDatabase(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
    if (db) return db

    const productName = '漫画阅读器'
    const appDataDir =
        process.platform === 'win32'
            ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), productName)
            : path.join(os.homedir(), '.comic-reader')

    if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true })
    }
    const dbPath = path.join(appDataDir, 'database.db')

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    })

    log.info(`[Server/DB] Database opened at ${dbPath}`)
    return db
}

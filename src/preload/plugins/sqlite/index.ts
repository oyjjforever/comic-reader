import sqlite3 from 'sqlite3'
import { Database, open } from 'sqlite'
import fs from 'fs'

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null

/**
 * @description: 打开数据库，并保存链接到全局变量
 * @return {Promise<void>} Promise
 */
const openDatabase = (): Promise<Database<sqlite3.Database, sqlite3.Statement>> => {
    return new Promise(async (resolve, reject) => {
        // 创建data目录
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data')
        }

        try {
            db = await open({
                filename: './data/database.db',
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
            created_at TEXT NOT NULL
        )
    `)
}

const database = {
    openDatabase,
}

export default database
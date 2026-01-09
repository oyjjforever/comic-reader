import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { promisify } from 'util'
import sqlitePlugin from './sqlite'

// 数据库实例
let db: Database<sqlite3.Database, sqlite3.Statement> | null = null

/**
 * @description: 获取数据库实例
 * @return {Promise<Database<sqlite3.Database, sqlite3.Statement>>} 数据库实例
 */
const getDatabase = async (): Promise<Database<sqlite3.Database, sqlite3.Statement>> => {
    if (!db) {
        db = await sqlitePlugin.openDatabase()
    }
    return db
}

/**
 * @description: 保存配置到 app_data 表
 * @param {string} key 配置键
 * @param {string} value 配置值
 */
const saveConfig = async (key: string, value: string): Promise<void> => {
    const database = await getDatabase()
    await database.run('INSERT OR REPLACE INTO app_data (key, value) VALUES (?, ?)', key, value)
}

/**
 * @description: 从 app_data 表获取配置
 * @param {string} key 配置键
 * @return {Promise<string | null>} 配置值
 */
const getConfig = async (key: string): Promise<string | null> => {
    const database = await getDatabase()
    const result = await database.get('SELECT value FROM app_data WHERE key = ?', key)
    return result?.value || null
}

/**
 * @description: 保存最后备份时间
 * @param {Date} backupTime 备份时间
 */
const saveLastBackupTime = async (backupTime: Date): Promise<void> => {
    await saveConfig('lastBackupTime', backupTime.toISOString())
}

/**
 * @description: 获取最后备份时间
 * @return {Promise<Date | null>} 最后备份时间
 */
const getLastBackupTime = async (): Promise<Date | null> => {
    const lastBackupTimeStr = await getConfig('lastBackupTime')
    return lastBackupTimeStr ? new Date(lastBackupTimeStr) : null
}

/**
 * @description: 检查是否需要备份
 * @param {number} backupIntervalInDays 备份间隔（天数）
 * @return {Promise<boolean>} 是否需要备份
 */
const shouldBackup = async (backupIntervalInDays: number): Promise<boolean> => {
    const lastBackupTime = await getLastBackupTime()

    // 如果从未备份过，则需要备份
    if (!lastBackupTime) {
        return true
    }

    // 计算距离上次备份的天数
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - lastBackupTime.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    // 如果距离上次备份的天数大于等于备份间隔，则需要备份
    return diffDays >= backupIntervalInDays
}

// 获取数据库路径
const getDatabasePath = (): string => {
    const productName = '漫画阅读器'
    const appDataDir =
        process.platform === 'win32'
            ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), productName)
            : path.join(os.homedir(), '.comic-reader')

    return path.join(appDataDir, 'database.db')
}

// 获取数据库备份目录
const getBackupDirectory = (customPath?: string): string => {
    if (customPath && fs.existsSync(customPath)) {
        return customPath
    }

    const productName = '漫画阅读器'
    const appDataDir =
        process.platform === 'win32'
            ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), productName)
            : path.join(os.homedir(), '.comic-reader')

    const backupDir = path.join(appDataDir, 'backups')
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
    }

    return backupDir
}

// 创建数据库备份
const createBackup = async (backupPath?: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const dbPath = getDatabasePath()
            const backupDir = getBackupDirectory(backupPath)

            // 生成备份文件名（包含时间戳）
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const backupFileName = `database-backup-${timestamp}.db`
            const backupFilePath = path.join(backupDir, backupFileName)

            // 确保源数据库文件存在
            if (!fs.existsSync(dbPath)) {
                return reject(new Error('源数据库文件不存在'))
            }

            // 复制数据库文件
            const readStream = fs.createReadStream(dbPath)
            const writeStream = fs.createWriteStream(backupFilePath)

            readStream.on('error', (error) => {
                reject(error)
            })

            writeStream.on('error', (error) => {
                reject(error)
            })

            writeStream.on('finish', async () => {
                try {
                    // 备份成功后，保存备份时间到数据库
                    await saveLastBackupTime(new Date())
                    resolve(backupFilePath)
                } catch (saveError) {
                    console.error('保存备份时间失败:', saveError)
                    // 即使保存时间失败，也返回备份文件路径
                    resolve(backupFilePath)
                }
            })

            readStream.pipe(writeStream)
        } catch (error) {
            reject(error)
        }
    })
}

// 恢复数据库
const restoreBackup = async (backupFilePath: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        try {
            const dbPath = getDatabasePath()

            // 确保备份文件存在
            if (!fs.existsSync(backupFilePath)) {
                return reject(new Error('备份文件不存在'))
            }

            // 确保目标目录存在
            const dbDir = path.dirname(dbPath)
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true })
            }

            // 如果原数据库存在，先创建一个临时备份
            if (fs.existsSync(dbPath)) {
                const tempBackupPath = path.join(dbDir, `database-temp-backup-${Date.now()}.db`)
                fs.copyFileSync(dbPath, tempBackupPath)
            }

            // 复制备份文件到数据库位置
            fs.copyFileSync(backupFilePath, dbPath)

            // 验证恢复的数据库
            try {
                const db = await open({
                    filename: dbPath,
                    driver: sqlite3.Database
                })
                await db.close()
                resolve()
            } catch (error) {
                // 如果验证失败，尝试恢复临时备份
                const tempBackupFiles = fs.readdirSync(dbDir).filter(file => file.startsWith('database-temp-backup-'))
                if (tempBackupFiles.length > 0) {
                    const latestTempBackup = tempBackupFiles.sort().pop()
                    if (latestTempBackup) {
                        fs.copyFileSync(path.join(dbDir, latestTempBackup), dbPath)
                    }
                }
                reject(new Error('数据库文件验证失败，已恢复原数据库'))
            }
        } catch (error) {
            reject(error)
        }
    })
}

// 获取所有备份文件列表
const getBackupList = async (backupPath?: string): Promise<Array<{ fileName: string, filePath: string, size: number, createdAt: Date }>> => {
    try {
        const backupDir = getBackupDirectory(backupPath)

        if (!fs.existsSync(backupDir)) {
            return []
        }

        const files = fs.readdirSync(backupDir)
        const backupFiles = files
            .filter(file => file.startsWith('database-backup-') && file.endsWith('.db'))
            .map(fileName => {
                const filePath = path.join(backupDir, fileName)
                const stats = fs.statSync(filePath)
                return {
                    fileName,
                    filePath,
                    size: stats.size,
                    createdAt: stats.birthtime
                }
            })
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // 按创建时间降序排列

        return backupFiles
    } catch (error) {
        throw new Error(`获取备份列表失败: ${error}`)
    }
}

// 删除备份文件
const deleteBackup = async (backupFilePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(backupFilePath)) {
                return reject(new Error('备份文件不存在'))
            }

            fs.unlinkSync(backupFilePath)
            resolve()
        } catch (error) {
            reject(error)
        }
    })
}

// 设置定时备份
const setupScheduledBackup = (intervalInWeeks: number, backupPath?: string): NodeJS.Timeout => {
    const intervalInMs = intervalInWeeks * 7 * 24 * 60 * 60 * 1000 // 转换为毫秒

    // 立即执行一次备份
    createBackup(backupPath).catch(error => {
        console.error('初始备份失败:', error)
    })

    // 设置定时器
    return setInterval(() => {
        createBackup(backupPath).catch(error => {
            console.error('定时备份失败:', error)
        })
    }, intervalInMs)
}

// 取消定时备份
const cancelScheduledBackup = (timerId: NodeJS.Timeout): void => {
    clearInterval(timerId)
}

// 检查并执行自动备份
const checkAndPerformAutoBackup = async (): Promise<boolean> => {
    try {
        // 从数据库获取设置
        const settingStr = await getConfig('setting')
        if (!settingStr) {
            return false
        }

        const setting = JSON.parse(settingStr)

        // 检查是否启用定时备份
        if (!setting.enableScheduledBackup) {
            return false
        }

        const backupInterval = setting.backupInterval || 1 // 默认1周
        const backupPath = setting.backupPath

        // 检查是否需要备份
        const needsBackup = await shouldBackup(backupInterval * 7) // 将周转换为天

        if (needsBackup) {
            // 执行备份
            await createBackup(backupPath || undefined)
            console.log('自动备份完成')
            return true
        }

        return false
    } catch (error) {
        console.error('自动备份失败:', error)
        return false
    }
}

export default {
    createBackup,
    restoreBackup,
    getBackupList,
    deleteBackup,
    setupScheduledBackup,
    cancelScheduledBackup,
    getDatabasePath,
    getBackupDirectory,
    checkAndPerformAutoBackup
}
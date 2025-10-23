import { app } from 'electron'
import log from 'electron-log'
import path from 'path'
import fs from 'fs'

/**
 * 目录存在性缓存，避免重复 IO 检查
 */
const ensuredDirs = new Set<string>()
function ensureDir(dirPath: string) {
    if (ensuredDirs.has(dirPath)) return
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
    }
    ensuredDirs.add(dirPath)
}

/**
 * 日志路径与清理工具（按日期分文件夹）
 */
const LOG_BASE_DIR_NAME = 'logs'

function dateStr(d = new Date()) {
    // 生成 YYYY-MM-DD
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString().slice(0, 10)
}
function getLogBaseDir() {
    return path.join(app.getPath('userData'), LOG_BASE_DIR_NAME)
}
function getLogDirByDate(d = new Date()) {
    return path.join(getLogBaseDir(), dateStr(d))
}
// 配置按日期输出日志到 YYYY-MM-DD/main.log
(log.transports.file as any).resolvePathFn = (variables: any) => {
    const dt = variables?.date instanceof Date ? variables.date : new Date()
    const dir = getLogDirByDate(dt)
    ensureDir(dir)
    return path.join(dir, 'main.log')
}
log.transports.file.level = 'info'

/**
 * 清理 N 天前的日志目录（按文件夹名 YYYY-MM-DD 判断）
 */
function cleanOldLogs(keepDays = 7) {
    try {
        const base = getLogBaseDir()
        if (!fs.existsSync(base)) return
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - keepDays)
        const entries = fs.readdirSync(base, { withFileTypes: true })
        for (const ent of entries) {
            if (!ent.isDirectory()) continue
            const dirName = ent.name
            const dirDate = new Date(dirName)
            if (isNaN(dirDate.getTime())) continue
            if (dirDate < cutoff) {
                try {
                    fs.rmSync(path.join(base, dirName), { recursive: true, force: true })
                } catch (e) {
                    log.warn('清理日志目录失败', { dir: dirName, error: (e as any)?.message })
                }
            }
        }
    } catch (err) {
        log.warn('执行日志清理时出错', (err as any)?.message || String(err))
    }
}

try {
    ensureDir(path.join(app.getPath('userData'), LOG_BASE_DIR_NAME))
    cleanOldLogs(7)
    const ONE_DAY = 24 * 60 * 60 * 1000
    setInterval(() => cleanOldLogs(7), ONE_DAY)
    log.info('应用启动，日志系统已初始化', { userData: app.getPath('userData') })
} catch (e) {
    console.warn('初始化日志系统失败', (e as any)?.message || String(e))
}

export default log
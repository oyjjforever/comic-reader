import log from 'electron-log'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { app, dialog } from 'electron'

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
 * 自动更新偏好存储（忽略版本）
 */
const UPDATER_STORE_FILE = 'updater.json'
function getUpdaterStorePath() {
    const dir = app.getPath('userData')
    ensureDir(dir)
    return path.join(dir, UPDATER_STORE_FILE)
}
function readUpdaterStore(): { ignoredVersion?: string } {
    try {
        const p = getUpdaterStorePath()
        if (!fs.existsSync(p)) return {}
        const txt = fs.readFileSync(p, 'utf-8')
        return (JSON.parse(txt) || {}) as { ignoredVersion?: string }
    } catch (e: any) {
        log.warn('读取更新偏好失败', e?.message || String(e))
        return {}
    }
}
function writeUpdaterStore(data: { ignoredVersion?: string }) {
    try {
        const p = getUpdaterStorePath()
        fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e: any) {
        log.warn('写入更新偏好失败', e?.message || String(e))
    }
}

let __manualUpdateCheck = false

function registerAutoUpdate(mainWindow) {
    try {
        autoUpdater.logger = log as any
        autoUpdater.autoDownload = false

        // 开发环境下强制检查更新
        if (is.dev) {
            autoUpdater.forceDevUpdateConfig = true
        }

        autoUpdater.on('error', (err: any) => {
            log.error('autoUpdater:error', err?.stack || err?.message || String(err))
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(-1)
                // 发送更新错误事件到渲染进程
                mainWindow.webContents.send('update:error', {
                    message: err?.message || String(err),
                    stack: err?.stack
                })
            }
        })

        autoUpdater.on('update-available', async (info) => {
            // 手动检查时一旦有可用更新，就不再显示"已是最新版本"的提示
            __manualUpdateCheck = false
            log.info('autoUpdater:update-available', info)

            const currentVersion = info?.version ?? ''
            const { ignoredVersion } = readUpdaterStore()
            if (ignoredVersion && currentVersion && ignoredVersion === currentVersion) {
                log.info('autoUpdater:version-ignored', { ignoredVersion })
                return
            }

            // 发送更新可用事件到渲染进程
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update:available', {
                    version: currentVersion,
                    releaseNotes: info?.releaseNotes || '暂无更新说明'
                })
            }
        })

        autoUpdater.on('update-not-available', () => {
            if (__manualUpdateCheck) {
                __manualUpdateCheck = false
                // 发送更新不可用事件到渲染进程
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update:not-available')
                }
            }
        })

        autoUpdater.on('download-progress', (p) => {
            const percent = Math.max(0, Math.min(100, p.percent || 0))
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(percent / 100)
                // 发送下载进度事件到渲染进程
                mainWindow.webContents.send('update:progress', {
                    percent,
                    bytesPerSecond: p.bytesPerSecond,
                    transferred: p.transferred,
                    total: p.total
                })
            }
            // log.info('autoUpdater:download-progress', {
            //   bytesPerSecond: p.bytesPerSecond,
            //   percent,
            //   transferred: p.transferred,
            //   total: p.total
            // })
        })

        autoUpdater.on('update-downloaded', async (info) => {
            log.info('autoUpdater:update-downloaded', info)
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(-1)
                // 发送下载完成事件到渲染进程
                mainWindow.webContents.send('update:downloaded', info)
            }
        })
    } catch (e: any) {
        log.error('初始化自动更新失败', e?.message || String(e))
    }
}

async function checkUpdate(mainWindow) {
    __manualUpdateCheck = true
    try {
        // 开发环境下强制检查更新
        if (is.dev) {
            autoUpdater.forceDevUpdateConfig = true
        }
        const res = await autoUpdater.checkForUpdates()
        return { ok: true, data: res }
    } catch (e: any) {
        __manualUpdateCheck = false
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:error', {
                message: `检查更新失败：${e?.message || String(e)}`
            })
        }
        return { ok: false, error: e?.message || String(e) }
    }
}

async function downloadUpdate(mainWindow) {
    try {
        await autoUpdater.downloadUpdate()
        return { ok: true }
    } catch (e: any) {
        log.error('downloadUpdate:error', e?.message || String(e))
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:error', {
                message: `更新包下载失败：${e?.message || String(e)}`
            })
            mainWindow.setProgressBar(-1)
        }
        return { ok: false, error: e?.message || String(e) }
    }
}

async function ignoreVersion(version) {
    try {
        writeUpdaterStore({ ignoredVersion: version })
        return { ok: true }
    } catch (e: any) {
        log.error('ignoreVersion:error', e?.message || String(e))
        return { ok: false, error: e?.message || String(e) }
    }
}

async function installUpdate() {
    try {
        setImmediate(() => {
            autoUpdater.quitAndInstall()
        })
        return { ok: true }
    } catch (e: any) {
        log.error('installUpdate:error', e?.message || String(e))
        return { ok: false, error: e?.message || String(e) }
    }
}

export {
    registerAutoUpdate,
    checkUpdate,
    downloadUpdate,
    ignoreVersion,
    installUpdate
}
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

function registerAutoUpdate() {
    if (is.dev) {
        log.info('跳过自动更新（开发环境）')
        return
    }
    try {
        autoUpdater.logger = log as any
        autoUpdater.autoDownload = false

        autoUpdater.on('error', (err: any) => {
            log.error('autoUpdater:error', err?.stack || err?.message || String(err))
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1)
        })

        autoUpdater.on('update-available', async (info) => {
            // 手动检查时一旦有可用更新，就不再显示“已是最新版本”的提示
            __manualUpdateCheck = false
            log.info('autoUpdater:update-available', info)

            const currentVersion = info?.version ?? ''
            const { ignoredVersion } = readUpdaterStore()
            if (ignoredVersion && currentVersion && ignoredVersion === currentVersion) {
                log.info('autoUpdater:version-ignored', { ignoredVersion })
                return
            }

            const { response } = await dialog.showMessageBox(mainWindow ?? null, {
                type: 'info',
                title: '发现新版本',
                message: `检测到新版本 ${currentVersion}，是否下载并安装？`,
                buttons: ['稍后', '忽略此版本', '确定'],
                defaultId: 2,
                cancelId: 0,
                noLink: true
            })

            // 忽略此版本
            if (response === 1) {
                writeUpdaterStore({ ignoredVersion: currentVersion })
                log.info('autoUpdater:ignored-version-set', { ignoredVersion: currentVersion })
                return
            }

            // 确定下载
            if (response === 2) {
                try {
                    await autoUpdater.downloadUpdate()
                } catch (e: any) {
                    log.error('downloadUpdate:error', e?.message || String(e))
                    dialog.showMessageBox(mainWindow ?? null, {
                        type: 'error',
                        title: '下载失败',
                        message: `更新包下载失败：${e?.message || String(e)}`
                    })
                    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1)
                }
            }
        })

        autoUpdater.on('update-not-available', () => {
            if (__manualUpdateCheck) {
                __manualUpdateCheck = false
                dialog.showMessageBox(mainWindow ?? null, {
                    type: 'info',
                    title: '检查更新',
                    message: '当前已是最新版本'
                })
            }
        })

        autoUpdater.on('download-progress', (p) => {
            const percent = Math.max(0, Math.min(100, p.percent || 0))
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setProgressBar(percent / 100)
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
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1)
            const { response } = await dialog.showMessageBox(mainWindow ?? null, {
                type: 'question',
                title: '更新就绪',
                message: '更新已下载，是否立即重启安装？',
                buttons: ['稍后', '立即重启'],
                defaultId: 1,
                cancelId: 0,
                noLink: true
            })
            if (response === 1) {
                setImmediate(() => {
                    try {
                        autoUpdater.quitAndInstall()
                    } catch (e: any) {
                        log.error('quitAndInstall:error', e?.message || String(e))
                    }
                })
            }
        })

        // 触发检查
        autoUpdater.checkForUpdates().catch((e: any) => {
            log.error('checkForUpdates:error', e?.message || String(e))
        })
    } catch (e: any) {
        log.error('初始化自动更新失败', e?.message || String(e))
    }
}

async function checkUpdate() {
    if (is.dev) {
        dialog.showMessageBox(mainWindow ?? null, {
            type: 'info',
            title: '检查更新',
            message: '开发环境下已跳过自动更新'
        })
        return { ok: true, dev: true }
    }
    __manualUpdateCheck = true
    try {
        await autoUpdater.checkForUpdates()
        return { ok: true }
    } catch (e: any) {
        __manualUpdateCheck = false
        dialog.showMessageBox(mainWindow ?? null, {
            type: 'error',
            title: '检查更新失败',
            message: e?.message || String(e)
        })
        return { ok: false, error: e?.message || String(e) }
    }
}
export {
    registerAutoUpdate,
    checkUpdate
}
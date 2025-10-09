import { app, net, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '/resources/icon.png?asset'
import log from '../utils/log'
import {
  registerAutoUpdate,
  checkUpdate
} from '../utils/update'
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

let mainWindow;
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      webviewTag: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
    }
  })

  mainWindow.on('ready-to-show', () => {
    setTimeout(() => {
      mainWindow.show()
    }, 100)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  // 初始化自动更新
  registerAutoUpdate()
  // 提供手动检查的 IPC
  ipcMain.handle('update:check', async () => {
    checkUpdate()
  })
  // 文件夹选择对话框（支持 defaultPath）
  ipcMain.handle('dialog:openDirectory', async (_event, options?: { defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择文件夹',
      defaultPath: options?.defaultPath
    })
    return result
  })
  ipcMain.on("get-window-size", () => {
    return mainWindow.isFullScreen()
  });
  ipcMain.handle("window-min", () => {
    mainWindow.minimize();
  });
  ipcMain.handle("window-unmax", () => {
    mainWindow.setFullScreen(false)
    mainWindow.setSize(1280, 720);
    mainWindow.center();
  });
  ipcMain.handle("window-max", () => {
    mainWindow.setFullScreen(true)
  });
  ipcMain.handle("window-close", () => {
    app.exit();
  });
  // 解压文件函数
  async function extractFile(filePath: string, extractDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ext = path.extname(filePath).toLowerCase()

      // 检查7zip是否可用
      let sevenZipCmd = ''
      try {
        // 尝试查找7zip安装路径
        if (process.platform === 'win32') {
          // Windows系统查找7zip
          const possiblePaths = [
            'W:\\Program Files\\7-Zip\\7z.exe',
            'C:\\Program Files\\7-Zip\\7z.exe',
            'C:\\Program Files (x86)\\7-Zip\\7z.exe',
            process.env['ProgramFiles'] + '\\7-Zip\\7z.exe',
            process.env['ProgramFiles(x86)'] + '\\7-Zip\\7z.exe'
          ]

          for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
              sevenZipCmd = p
              break
            }
          }

          if (!sevenZipCmd) {
            // 如果找不到7zip，尝试使用系统自带的tar或使用Node.js解压库
            throw new Error('未找到7zip安装路径')
          }
        }
      } catch (err) {
        console.warn('7zip未安装，使用Node.js解压:', err)
        sevenZipCmd = ''
      }

      if (sevenZipCmd) {
        // 使用7zip解压
        const args = ['x', filePath, `-o${extractDir}`, '-y']
        const child = spawn(sevenZipCmd, args)

        child.on('close', (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`7zip解压失败，退出码: ${code}`))
          }
        })

        child.on('error', (err) => {
          reject(new Error(`7zip解压错误: ${err.message}`))
        })
      } else {
        // 使用Node.js内置解压（支持zip格式）
        if (ext === '.zip') {
          const { extract } = require('zip-lib')
          extract(filePath, extractDir)
            .then(() => resolve())
            .catch((err: any) => reject(new Error(`ZIP解压失败: ${err.message}`)))
        } else {
          reject(new Error(`不支持的解压格式: ${ext}，请安装7zip`))
        }
      }
    })
  }

  ipcMain.handle('download:start', async (_e, payload) => {
    // 生成本次下载的唯一ID，便于日志串联
    const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const maxRetries = 3
    const baseDelayMs = 1000
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const { url, fileName, savePath, autoExtract = true, headers = {} } = payload || {}
    if (!url || !fileName || !savePath) {
      log.warn('download:invalid-params', { downloadId, url, fileName, savePath })
      throw new Error('缺少必要参数')
    }
    log.info('download:start', { downloadId, url, fileName, savePath, autoExtract, headers: Object.keys(headers || {}) })

    // 清理文件名，拼接保存路径
    const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
    const fullPath = path.join(savePath, safeName)
    log.info('download:path-prepared', { downloadId, fullPath })
    ensureDir(savePath)

    // 单次尝试：返回 Promise
    const attemptOnce = () => {
      return new Promise((resolve, reject) => {
        try {
          const request = net.request(url)
          if (headers && typeof headers === 'object') {
            for (const [k, v] of Object.entries(headers)) {
              if (typeof v === 'string') request.setHeader(k, v)
            }
          }
          request.on('response', (response: any) => {
            const fileStream = fs.createWriteStream(fullPath)
            const lenHeader = response.headers?.['content-length']
            const total = Array.isArray(lenHeader) ? parseInt(lenHeader[0] || '0', 10) : parseInt(lenHeader || '0', 10)
            let received = 0

            fileStream.on('error', (err) => {
              log.error('download:file-error', { downloadId, error: err?.message })
              reject(new Error(`文件写入失败: ${err.message}`))
            })

            fileStream.on('finish', async () => {
              try {
                const ext = path.extname(fullPath).toLowerCase()
                const supportedExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']

                if (autoExtract && supportedExts.includes(ext)) {
                  log.info('download:extract:start', { downloadId, archive: fullPath, ext })
                  const extractDir = path.join(savePath, path.basename(fullPath, ext))
                  ensureDir(extractDir)
                  await extractFile(fullPath, extractDir)
                  log.info('download:extract:success', { downloadId, extractDir })
                  fs.unlinkSync(fullPath)
                  log.info('download:archive-removed', { downloadId, archive: fullPath })
                  resolve({
                    savePath: extractDir,
                    extractedPath: extractDir,
                    extracted: true
                  })
                } else {
                  resolve({
                    savePath: fullPath,
                    extracted: false
                  })
                }
              } catch (extractErr: any) {
                log.error('download:extract:error', { downloadId, error: extractErr?.message || String(extractErr) })
                reject(new Error(`下载完成但解压失败: ${extractErr?.message || String(extractErr)}`))
              }
            })

            response.on('data', (chunk: Buffer) => {
              received += chunk.length
              fileStream.write(chunk)
            })

            response.on('end', () => {
              log.info('download:response-end', { downloadId, received, total })
              fileStream.end()
            })

            response.on('error', (err: any) => {
              log.error('download:response-error', { downloadId, error: err?.message })
              fileStream.destroy()
              reject(new Error(`响应错误: ${err.message}`))
            })
          })

          request.on('error', (err: any) => {
            log.error('download:request-error', { downloadId, error: err?.message })
            reject(new Error(`${url} 请求失败: ${err.message}`))
          })

          request.end()
          log.info('download:request-ended', { downloadId })
        } catch (err: any) {
          log.error('download:unhandled-error', { downloadId, error: err?.message || String(err) })
          reject(new Error(`未知错误: ${err?.message || String(err)}`))
        }
      })
    }

    // 重试循环
    let lastErr: any = null
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log.info('download:attempt', { downloadId, attempt })
        const res: any = await attemptOnce()
        log.info('download:completed', { downloadId, path: res.extracted ? res.extractedPath : res.savePath, extracted: !!res.extracted })
        return res
      } catch (e: any) {
        lastErr = e
        log.warn('download:attempt-failed', { downloadId, attempt, error: e?.message || String(e) })
        if (attempt < maxRetries) {
          const wait = baseDelayMs * Math.pow(2, attempt - 1)
          log.info('download:retry-wait', { downloadId, waitMs: wait })
          await delay(wait)
        }
      }
    }
    // 用最后一次错误作为拒绝原因
    throw lastErr || new Error('下载失败')
  })
  // 在 persist:thirdparty 分区拦截下载
  const { session } = require('electron')
  const thirdPartySession = session.fromPartition('persist:thirdparty')
  thirdPartySession.on('will-download', (event, item, webContents) => {
    item.setSavePath('C:/')
    mainWindow.webContents.send("download:prepare", { url: item.getURL(), fileName: item.getFilename() });
    return
  })

})
app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
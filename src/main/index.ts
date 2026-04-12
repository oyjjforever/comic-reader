import { app, net, shell, BrowserWindow, ipcMain, dialog, globalShortcut, clipboard, screen, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '/resources/icon.png?asset'
import log from '../utils/log'
import { setupClipboardWatcher, showClipboardPopup } from '../utils/clipboardWatcher'
import {
  registerAutoUpdate,
  checkUpdate,
  downloadUpdate,
  ignoreVersion,
  installUpdate
} from '../utils/update'
import { getServerInstance } from '../server/index'
import { getDiscoveryInstance } from '../server/discovery'
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

let mainWindow: BrowserWindow;
let tray: Tray | null = null;
let isQuitting = false;

/**
 * 关闭行为配置（持久化到 userData 目录）
 */
interface CloseConfig {
  closeToTray: boolean;
  dontRemind: boolean;
}

function getCloseConfigPath(): string {
  return path.join(app.getPath('userData'), 'close-config.json');
}

function readCloseConfig(): CloseConfig {
  try {
    const configPath = getCloseConfigPath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        closeToTray: data.closeToTray ?? true,
        dontRemind: data.dontRemind ?? false
      };
    }
  } catch (e) {
    log.warn('[Main] Failed to read close config:', e);
  }
  return { closeToTray: true, dontRemind: false };
}

function writeCloseConfig(config: CloseConfig): void {
  try {
    const configPath = getCloseConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    log.warn('[Main] Failed to write close config:', e);
  }
}

function createTray(): void {
  const trayIconPath = path.join(__dirname, '../resources/icon.png');
  let trayIcon: Electron.NativeImage;
  if (fs.existsSync(trayIconPath)) {
    trayIcon = nativeImage.createFromPath(trayIconPath);
  } else {
    trayIcon = nativeImage.createFromPath(icon);
  }
  // Resize for tray (16x16 on Windows)
  trayIcon = trayIcon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Comic Reader');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: false,
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
  // 拦截 window.open 及新窗口请求
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 使用默认浏览器打开链接
    shell.openExternal(url); // 注意：需对url进行安全校验，特别是来自不可信源时
    // 阻止 Electron 创建新窗口
    return { action: 'deny' };
  });
  mainWindow.on('ready-to-show', () => {
    setTimeout(() => {
      mainWindow!.show()
    }, 100)
  })

  // 拦截窗口关闭事件，支持最小化到托盘
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      handleWindowClose()
    }
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
  globalShortcut.register("CommandOrControl+alt+shift+l", () => {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  });
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  createTray()
  // 初始化自动更新
  registerAutoUpdate(mainWindow)

  // 等待主窗口完全加载后再初始化剪切板监听
  mainWindow.webContents.once('did-finish-load', () => {
    setupClipboardWatcher(mainWindow)
  })

  // ========== 远程访问 HTTP 服务器 ==========
  const server = getServerInstance()
  const discovery = getDiscoveryInstance()

  // 从设置中读取是否启用局域网中转服务（默认不启用）
  // 设置由 renderer 通过 IPC 传递，此处先不自动启动
  // renderer 中的 LanServiceSettings.vue 会在设置变更时调用 server:start / server:stop
  log.info('[Main] LAN service will be controlled by user setting (enableLanService)')

  // IPC: 获取服务器状态
  ipcMain.handle('server:status', () => {
    return {
      running: server.isRunning(),
      port: server.getPort()
    }
  })

  // IPC: 启动服务器
  ipcMain.handle('server:start', async () => {
    try {
      const actualPort = await server.start()
      await discovery.start(actualPort)
      return { success: true, port: actualPort }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // IPC: 停止服务器
  ipcMain.handle('server:stop', async () => {
    try {
      discovery.stop()
      await server.stop()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // IPC: 设置资源路径
  ipcMain.handle('server:setResourcePath', (_event, resourcePath: string) => {
    server.setResourcePath(resourcePath)
    return { success: true }
  })
  // 提供手动检查的 IPC
  ipcMain.handle('update:check', async () => {
    return checkUpdate(mainWindow)
  })

  // 下载更新的 IPC
  ipcMain.handle('update:download', async () => {
    return downloadUpdate(mainWindow)
  })

  // 忽略版本的 IPC
  ipcMain.handle('update:ignore', async (_, version) => {
    return ignoreVersion(version)
  })

  // 安装更新的 IPC
  ipcMain.handle('update:install', async () => {
    return installUpdate()
  })

  // 获取应用版本信息的 IPC
  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion()
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
    handleWindowClose()
  });

  ipcMain.handle("window-show", () => {
    mainWindow.show()
    mainWindow.focus()
  });

  // 关闭配置 IPC
  ipcMain.handle('close-config:get', () => {
    return readCloseConfig()
  })

  ipcMain.handle('close-config:set', (_event, config: CloseConfig) => {
    writeCloseConfig(config)
  })

  ipcMain.handle('close-config:reset', () => {
    writeCloseConfig({ closeToTray: true, dontRemind: false })
  })
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
ipcMain.handle('site:getCookies', async (_e, payload) => {
  try {
    const { session } = require('electron')
    const currentSession = session.fromPartition('persist:thirdparty')
    const cookies = await currentSession.cookies.get({})
    return cookies // 明确返回cookies
  } catch (error) {
    console.error('获取cookies失败:', error)
    return null // 或返回空数组 []，根据你的错误处理逻辑
  }
})


// 关闭弹窗的 IPC 处理
ipcMain.handle('popup-close', () => {
  const windows = BrowserWindow.getAllWindows()
  const popupWindow = windows.find(w => w !== mainWindow && w.getTitle().includes('剪切板弹窗'))
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.hide()
  }
})

// 添加到下载队列的 IPC 处理
ipcMain.on('add-to-download-queue', (_, url: string) => {
  // 这里可以实现添加到下载队列的逻辑
  // 可以调用现有的下载功能
  console.log('添加到下载队列:', url)
  // 可以通过事件或直接调用下载模块来处理
})

// 读取当前剪切板文本内容
ipcMain.handle('clipboard:readText', () => {
  return clipboard.readText() || ''
})

// 显示剪切板弹窗的 IPC 处理
ipcMain.on('show-clipboard-popup', (_, position: 'cursor' | 'bottom-right' = 'cursor') => {

  showClipboardPopup(position)
})


app.on('before-quit', () => {
  isQuitting = true
})

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  // 清理剪切板监听
  const { cleanupClipboardMonitor } = require('../utils/clipboardWatcher')
  cleanupClipboardMonitor()

  // 停止远程访问服务器和 mDNS 发现
  try {
    const discovery = getDiscoveryInstance()
    const server = getServerInstance()
    discovery.stop()
    server.stop()
  } catch (e) {
    // ignore cleanup errors
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * 处理窗口关闭行为：根据配置决定是最小化到托盘还是退出
 */
function handleWindowClose(): void {
  const config = readCloseConfig()

  if (config.dontRemind) {
    // 用户选择了不再提醒，直接按保存的偏好执行
    if (config.closeToTray) {
      mainWindow.hide()
    } else {
      isQuitting = true
      app.quit()
    }
    return
  }

  // 通知渲染进程显示关闭确认对话框
  mainWindow.webContents.send('show-close-dialog')
}

// 接收渲染进程的关闭对话框响应
ipcMain.handle('close-dialog-response', (_event, response: { closeToTray: boolean; dontRemind: boolean }) => {
  const { closeToTray, dontRemind } = response

  // 保存用户选择
  if (dontRemind) {
    writeCloseConfig({ closeToTray, dontRemind: true })
  }

  if (closeToTray) {
    mainWindow.hide()
  } else {
    isQuitting = true
    app.quit()
  }
})
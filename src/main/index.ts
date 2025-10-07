import { app, net, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '/resources/icon.png?asset'

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
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1290,
    height: 720,
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // 注册IPC处理器
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
    mainWindow.setSize(1290, 720);
    mainWindow.center();
    // mainWindow.webContents.send("main-window-unmax");
  });
  ipcMain.handle("window-max", () => {
    mainWindow.setFullScreen(true)
    // mainWindow.webContents.send("main-window-max")
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

  ipcMain.on('download:start', async (_e, payload) => {
    try {
      const { url, fileName, savePath, autoExtract = true, headers = {} } = payload || {}
      if (!url || !fileName || !savePath) {
        mainWindow?.webContents.send('download:failed', { state: 'error', message: '缺少必要参数' })
        return
      }

      // 清理文件名，拼接保存路径
      const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
      const fullPath = path.join(savePath, safeName)

      // 确保目录存在
      ensureDir(savePath)

      const request = net.request(url)
      // 设置可选请求头（例如 Referer）
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

        // 添加文件流错误处理
        fileStream.on('error', (err) => {
          mainWindow?.webContents.send('download:failed', { state: 'error', message: `文件写入失败: ${err.message}` })
        })

        fileStream.on('finish', async () => {
          try {
            // 下载完成，检查是否需要解压
            const ext = path.extname(fullPath).toLowerCase()
            const supportedExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']

            if (autoExtract && supportedExts.includes(ext)) {
              mainWindow?.webContents.send('download:extracting', { filePath: fullPath })

              // 创建解压目录
              const extractDir = path.join(savePath, path.basename(fullPath, ext))
              ensureDir(extractDir)

              // 解压文件
              await extractFile(fullPath, extractDir)

              // 解压成功后删除原始压缩文件
              fs.unlinkSync(fullPath)

              mainWindow?.webContents.send('download:completed', {
                savePath: extractDir,
                extractedPath: extractDir,
                extracted: true
              })
            } else {
              mainWindow?.webContents.send('download:completed', {
                savePath: fullPath,
                extracted: false
              })
            }
          } catch (extractErr: any) {
            mainWindow?.webContents.send('download:failed', {
              state: 'error',
              message: `下载完成但解压失败: ${extractErr?.message || String(extractErr)}`
            })
          }
        })

        response.on('data', (chunk: Buffer) => {
          received += chunk.length
          fileStream.write(chunk)
          mainWindow?.webContents.send('download:progress', { received, total })
        })

        response.on('end', () => {
          fileStream.end()
        })

        response.on('error', (err: any) => {
          fileStream.destroy()
          mainWindow?.webContents.send('download:failed', { state: 'error', message: `响应错误: ${err.message}` })
        })
      })

      request.on('error', (err: any) => {
        mainWindow?.webContents.send('download:failed', { state: 'error', message: `${url} 请求失败: ${err.message}` })
      })

      request.end()
    } catch (err: any) {
      mainWindow?.webContents.send('download:failed', { state: 'error', message: `未知错误: ${err?.message || String(err)}` })
    }
  })
  // 在 persist:thirdparty 分区拦截下载
  const { session } = require('electron')
  const thirdPartySession = session.fromPartition('persist:thirdparty')
  thirdPartySession.on('will-download', (event, item, webContents) => {
    item.setSavePath('C:/')
    mainWindow.webContents.send("download:prepare", { url: item.getURL(), fileName: item.getFilename() });
    return
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
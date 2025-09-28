import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '/resources/icon.png?asset'

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
      preload: join(__dirname, '../preload/index.cjs'),
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
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
  // 文件夹选择对话框
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择资源文件夹'
    })
    return result
  })
  ipcMain.on("get-window-size", () => {
    return mainWindow.isFullScreen()
    if (mainWindow.isFullScreen()) mainWindow.webContents.send("main-window-max");
    else mainWindow.webContents.send("main-window-unmax");
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
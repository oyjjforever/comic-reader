import { clipboard, screen, BrowserWindow, ipcMain } from 'electron'
import path from 'path'

// 剪切板监听主要逻辑
let lastClipboardContent = ''
let clipboardWatcherInterval: NodeJS.Timeout | null = null

// 检查是否是漫画相关内容
function isComicRelatedContent(text: string): boolean {
    const comicSites = ['pixiv.net', 'twitter.com', 'weibo.com', 'jmcomic.com', '18comic.vip']
    return comicSites.some(site => text.includes(site))
}

// 显示剪切板弹窗
export function showClipboardPopup(content: string) {
    // 检查是否已经存在弹窗
    const existingWindows = BrowserWindow.getAllWindows()
    const existingPopup = existingWindows.find(w => w.getTitle().includes('剪切板弹窗'))

    if (existingPopup && !existingPopup.isDestroyed()) {
        // 如果已存在弹窗，重新计算位置并更新内容
        const cursorPos = screen.getCursorScreenPoint()
        existingPopup.setPosition(cursorPos.x + 10, cursorPos.y + 10)
        existingPopup.webContents.send('clipboard-content', content)
        existingPopup.focus() // 将弹窗置于前台
        return
    }

    const cursorPos = screen.getCursorScreenPoint()

    const popup = new BrowserWindow({
        width: 600,
        height: 500,
        x: cursorPos.x + 10,
        y: cursorPos.y + 10,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        transparent: true,
        webPreferences: {
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, '../preload/index.cjs'),
        }
    })
    // 加载统一的 HTML 文件，使用路由参数
    if (process.env['ELECTRON_RENDERER_URL']) {
        popup.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/popup/search`)
        // popup.webContents.openDevTools({ mode: "detach" })
    } else {
        popup.loadFile(path.join(__dirname, '../renderer/index.html'), {
            hash: 'popup/search'
        })
    }

    // 传递剪切板内容到弹出窗口
    popup.webContents.once('did-finish-load', () => {
        popup.webContents.send('clipboard-content', content)
    })
}

// 设置剪切板监听
export function setupClipboardWatcher(mainWindow: BrowserWindow) {
    // 清除可能存在的旧定时器
    if (clipboardWatcherInterval) {
        clearInterval(clipboardWatcherInterval)
    }

    // 初始化时记录当前剪切板内容，避免启动时立即触发
    lastClipboardContent = clipboard.readText() || ''

    clipboardWatcherInterval = setInterval(() => {
        const currentContent = clipboard.readText()

        if (currentContent !== lastClipboardContent && currentContent) {
            lastClipboardContent = currentContent

            // 检查是否是漫画相关链接
            if (true || isComicRelatedContent(currentContent)) {
                // 通知渲染进程剪切板内容发生变化
                // 由渲染进程进行业务判断（如检查 enableClipboardMonitor）
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('clipboard-content-changed', currentContent)
                }
            }
        }
    }, 500) // 每500ms检查一次
}

// 清理剪切板监听
export function cleanupClipboardMonitor() {
    if (clipboardWatcherInterval) {
        clearInterval(clipboardWatcherInterval)
        clipboardWatcherInterval = null
    }
}
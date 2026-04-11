import { contextBridge, ipcRenderer, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import fs from 'fs'
import systemInterface from './plugins/systemInterface'
import media from './plugins/media'
import appData from './plugins/appData'
import favorite from './plugins/favorite'
import tag from './plugins/tag'
import videoBookmarks from './plugins/video-bookmarks'
import dlna from './plugins/dlna'
import file from './plugins/file'
import jmtt from './plugins/downloader/jmtt/index'
import pixiv from './plugins/downloader/pixiv'
import twitter from './plugins/downloader/twitter'
import weibo from './plugins/downloader/weibo'
import specialAttention from './plugins/special-attention'
import browseHistory from './plugins/browseHistory'
import downloadHistory from './plugins/downloadHistory'
import databaseBackup from './plugins/databaseBackup'

// 远程访问服务器 IPC 桥接
const server = {
  status: () => ipcRenderer.invoke('server:status'),
  start: () => ipcRenderer.invoke('server:start'),
  stop: () => ipcRenderer.invoke('server:stop'),
  setResourcePath: (resourcePath: string) => ipcRenderer.invoke('server:setResourcePath', resourcePath)
}

// 关闭行为配置 IPC 桥接
const closeConfig = {
  get: (): Promise<{ closeToTray: boolean; dontRemind: boolean }> => ipcRenderer.invoke('close-config:get'),
  set: (config: { closeToTray: boolean; dontRemind: boolean }) => ipcRenderer.invoke('close-config:set', config),
  reset: () => ipcRenderer.invoke('close-config:reset'),
  respond: (response: { closeToTray: boolean; dontRemind: boolean }) => ipcRenderer.invoke('close-dialog-response', response),
  onShowDialog: (callback: () => void) => {
    ipcRenderer.on('show-close-dialog', callback)
    return () => ipcRenderer.removeListener('show-close-dialog', callback)
  }
}

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('file', file)
    contextBridge.exposeInMainWorld('systemInterface', systemInterface)
    contextBridge.exposeInMainWorld('appData', appData)
    contextBridge.exposeInMainWorld('favorite', favorite)
    contextBridge.exposeInMainWorld('tag', tag)
    contextBridge.exposeInMainWorld('videoBookmarks', videoBookmarks)
    contextBridge.exposeInMainWorld('dlna', dlna)
    contextBridge.exposeInMainWorld('media', media)
    contextBridge.exposeInMainWorld('jmtt', jmtt)
    contextBridge.exposeInMainWorld('pixiv', pixiv)
    contextBridge.exposeInMainWorld('twitter', twitter)
    contextBridge.exposeInMainWorld('weibo', weibo)
    contextBridge.exposeInMainWorld('specialAttention', specialAttention)
    contextBridge.exposeInMainWorld('browseHistory', browseHistory)
    contextBridge.exposeInMainWorld('downloadHistory', downloadHistory)
    contextBridge.exposeInMainWorld('databaseBackup', databaseBackup)
    contextBridge.exposeInMainWorld('server', server)
    contextBridge.exposeInMainWorld('closeConfig', closeConfig)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.fs = fs
  // @ts-ignore (define in dts)
  window.electronAPI = clipboardAPI
}

import { contextBridge } from 'electron'
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
}

import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import fs from 'fs'
import systemInterface from './plugins/systemInterface'
import book from './plugins/book'
import video from './plugins/video'
import appData from './plugins/appData'
import favorite from './plugins/favorite'
import videoBookmarks from './plugins/video-bookmarks'
import dlna from './plugins/dlna'
import file from './plugins/file'
import jmtt from './plugins/downloader/jmtt/index.ts'
import pixiv from './plugins/downloader/pixiv'
import twitter from './plugins/downloader/twitter'
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
    contextBridge.exposeInMainWorld('videoBookmarks', videoBookmarks)
    contextBridge.exposeInMainWorld('dlna', dlna)
    contextBridge.exposeInMainWorld('book', book)
    contextBridge.exposeInMainWorld('video', video)
    contextBridge.exposeInMainWorld('jmtt', jmtt)
    contextBridge.exposeInMainWorld('pixiv', pixiv)
    contextBridge.exposeInMainWorld('twitter', twitter)
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

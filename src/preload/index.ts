import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import fs from 'fs'
import systemInterface from './plugins/systemInterface'
import book from './plugins/book'
import video from './plugins/video'
import appData from './plugins/appData'
import favorite from './plugins/favorite'
import videoBookmarks from './plugins/video-bookmarks'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('fs', fs)
    contextBridge.exposeInMainWorld('systemInterface', systemInterface)
    contextBridge.exposeInMainWorld('appData', appData)
    contextBridge.exposeInMainWorld('favorite', favorite)
    contextBridge.exposeInMainWorld('videoBookmarks', videoBookmarks)
    contextBridge.exposeInMainWorld('book', book)
    contextBridge.exposeInMainWorld('video', video)
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

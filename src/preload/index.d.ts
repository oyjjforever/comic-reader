import { ElectronAPI } from '@electron-toolkit/preload'
import sqlite3 from 'sqlite3'
import { Database } from 'sqlite'
import type { books } from '@/typings/database'
import type { FolderInfo, FileInfo } from '@/typings/file'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    fs: any
    appData: {
      get: (key: string) => Promise<string | undefined>
      set: (key: string, value: string) => Promise<void>
    },
    systemInterface: {
      openExplorer: (path: string) => void
      unzip: (path: string) => void
    }
    book: {
      getFolderTree: (dirPath: string) => Promise<FolderInfo[]>
      getFolderList: (dirPath: string) => Promise<FolderInfo[]>
      getFiles: (dirPath: string, sortOptions?: any, includeSubfolders?: boolean) => Promise<FileInfo[]>
      getFolderInfo: (filePath: string) => Promise<FolderInfo>
      getFolderCoverInfo: (filePath: string) => Promise<{ coverPath?: string; coverFileName?: string }>
    },
    video: {
      getFolderTree: (dirPath: string) => Promise<FolderInfo[]>
      getFiles: (dirPath: string, sortOptions?: any, includeSubfolders?: boolean) => Promise<FileInfo[]>
    }
    favorite: {
      getFavorites: () => Promise<any[]>
      getFavorite: (id: number) => Promise<any | null>
      isFavorited: (fullPath: string) => Promise<boolean>
      addFavorite: (fullPath: string) => Promise<{ success: boolean; message: string; id?: number }>
      deleteFavorite: (id: number) => Promise<{ success: boolean; message: string }>
      deleteFavoriteByPath: (fullPath: string) => Promise<{ success: boolean; message: string }>
      toggleFavorite: (fullPath: string) => Promise<boolean>
      getFavoriteCount: () => Promise<number>
    }
  }
}

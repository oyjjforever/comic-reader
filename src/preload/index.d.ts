import { ElectronAPI } from '@electron-toolkit/preload'
import sqlite3 from 'sqlite3'
import { Database } from 'sqlite'
import type { books } from '@/typings/database'
import type { FolderInfo, FileInfo } from '@/typings/file'
import type { VideoBookmark } from '@/typings/video-bookmarks'

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
      getFileInfo: (dirPath: string) => Promise<FileInfo>
      getFiles: (dirPath: string, sortOptions?: any, includeSubfolders?: boolean) => Promise<FileInfo[]>
    }
    favorite: {
      getFavorites: (order: string, module: string) => Promise<any[]>
      getFavorite: (id: number, module: string) => Promise<any | null>
      isFavorited: (fullPath: string, module: string) => Promise<boolean>
      addFavorite: (fullPath: string, module: string) => Promise<{ success: boolean; message: string; id?: number }>
      deleteFavorite: (id: number, module: string) => Promise<{ success: boolean; message: string }>
      deleteFavoriteByPath: (fullPath: string, module: string) => Promise<{ success: boolean; message: string }>
      toggleFavorite: (fullPath: string, module: string) => Promise<boolean>
      getFavoriteCount: (module: string) => Promise<number>
    }
    videoBookmarks: {
      getVideoBookmarks: (videoPath: string, order?: string) => Promise<VideoBookmark[]>;
      addVideoBookmark: (videoPath: string, timePoint: number, title?: string, description?: string) => Promise<number>;
      deleteVideoBookmark: (id: number) => Promise<void>;
      updateVideoBookmark: (id: number, title?: string, description?: string) => Promise<void>;
      getVideoBookmarkCount: (videoPath: string) => Promise<number>;
      isTimePointBookmarked: (videoPath: string, timePoint: number) => Promise<boolean>;
    }
  }
}

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
    media: {
      getFolderTree: (dirPath: string, noLeaf: boolean) => Promise<FolderInfo[]>
      getFolderList: (dirPath: string) => Promise<FolderInfo[]>
      getFiles: (dirPath: string, sortOptions?: any, filterExtensions?: string[], mediaType?: 'image' | 'video' | 'all') => Promise<FileInfo[]>
      getFolderInfo: (filePath: string, sortOptions?: any) => Promise<FolderInfo>
      getFileInfo: (dirPath: string) => Promise<FileInfo>
      getFolderCoverInfo: (filePath: string) => Promise<{ coverPath?: string; coverFileName?: string }>
      // 工具函数
      isImageFile: (file: FileInfo) => boolean
      isVideoFile: (file: FileInfo) => boolean
      determineMediaType: (files: FileInfo[]) => 'image' | 'video' | 'mixed' | 'empty' | string
    },
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
    },
    specialAttention: {
      init: () => Promise<void>;
      add: (entry: { source: 'pixiv' | 'jmtt' | 'twitter'; authorId: string; authorName?: string; extra?: any; latestWorkTime?: number; latestWorkId?: string; ignoredWorkIds?: string[] }) => Promise<{ id: number | undefined }>;
      remove: (id: number) => Promise<boolean>;
      update: (id: number, patch: Partial<{ authorName: string; extra: any; latestWorkTime: number; latestWorkId: string; ignoredWorkIds: string[]; sort: number }>) => Promise<boolean>;
      list: () => Promise<Array<{ id?: number; source: 'pixiv' | 'jmtt' | 'twitter'; authorId: string; authorName?: string | null; extra?: any | null; createdAt?: number; latestWorkTime?: number | null; latestWorkId?: string | null; ignoredWorkIds?: string[] }>>;
      increasePriority: (id: number, delta?: number) => Promise<boolean>;
      decreasePriority: (id: number, delta?: number) => Promise<boolean>;
      swapPriority: (id1: number, id2: number) => Promise<boolean>;
    }
  }
}

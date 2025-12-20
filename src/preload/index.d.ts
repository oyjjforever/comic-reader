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
      deleteFolder: (folderPath: string) => Promise<boolean>
    }
    media: {
      getFolderTree: (dirPath: string, noLeaf: boolean) => Promise<FolderInfo[]>
      getFolderList: (dirPath: string) => Promise<FolderInfo[]>
      getFolderListPaginated: (dirPath: string, page: number, pageSize: number) => Promise<{ folders: FolderInfo[], hasMore: boolean }>
      getFolderListBasic: (dirPath: string) => Promise<any[]>
      loadFolderDetails: (folderPath: string) => Promise<FolderInfo>
      getFiles: (dirPath: string, sortOptions?: any, filterExtensions?: string[], mediaType?: 'image' | 'video' | 'all') => Promise<FileInfo[]>
      getFolderInfo: (filePath: string, sortOptions?: any) => Promise<FolderInfo>
      getFolderInfoCached: (folderPath: string) => Promise<FolderInfo>
      getFileInfo: (dirPath: string) => Promise<FileInfo>
      getFolderCoverInfo: (filePath: string) => Promise<{ coverPath?: string; coverFileName?: string }>
      clearExpiredCache: () => void
      // 工具函数
      isImageFile: (file: FileInfo) => boolean
      isVideoFile: (file: FileInfo) => boolean
      determineMediaType: (files: FileInfo[]) => 'image' | 'video' | 'mixed' | 'empty' | string
    },
    favorite: {
      getFavorites: (order: string, module: string) => Promise<any[]>
      getFavorite: (id: number, module: string) => Promise<any | null>
      isFavorited: (fullPath: string, module: string) => Promise<boolean>
      addFavorite: (fullPath: string, module: string, tagIds?: string) => Promise<number>
      deleteFavorite: (id: number) => Promise<void>
      deleteFavoriteByPath: (fullPath: string, module: string) => Promise<void>
      toggleFavorite: (fullPath: string, module: string) => Promise<boolean>
      getFavoriteCount: (module?: string) => Promise<number>
      updateFavoriteTags: (id: number, tagIds: string) => Promise<void>
      getFavoriteTags: (id: number) => Promise<any[]>
      getFavoritesByTags: (tagIdstr: string, order?: string, module?: string) => Promise<any[]>
    }
    tag: {
      getTags: (order?: string, namespace?: string) => Promise<any[]>
      getTag: (id: number) => Promise<any>
      getTagByLabel: (label: string, namespace?: string) => Promise<any | null>
      addTag: (label: string, namespace?: string) => Promise<number>
      addFolderTag: (label: string, folderPath: string, namespace?: string) => Promise<number>
      getTagByFolderPath: (folderPath: string, namespace?: string) => Promise<any | null>
      getFolderTags: (order?: string, namespace?: string) => Promise<any[]>
      getNormalTags: (order?: string, namespace?: string) => Promise<any[]>
      isFolderTagged: (folderPath: string, namespace?: string) => Promise<boolean>
      updateTag: (id: number, label: string) => Promise<void>
      deleteTag: (id: number) => Promise<void>
      getTagCount: () => Promise<number>
      getTagsByIds: (ids: string, namespace?: string) => Promise<any[]>
      updateTagSortOrder: (id: number, sortOrder: number) => Promise<void>
      updateTagsSortOrder: (tagSorts: { id: number, sortOrder: number }[]) => Promise<void>
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
    browseHistory: {
      addBrowseHistory: (fullPath: string, module: string) => Promise<boolean>;
      getBrowseHistory: (limit?: number, module?: string) => Promise<any[]>;
      deleteBrowseHistory: (id: number) => Promise<boolean>;
      clearBrowseHistory: () => Promise<boolean>;
    }
    downloadHistory: {
      addDownloadHistory: (fullPath: string, module: string) => Promise<boolean>;
      getDownloadHistory: (limit?: number, module?: string) => Promise<any[]>;
      deleteDownloadHistory: (id: number) => Promise<boolean>;
      clearDownloadHistory: () => Promise<boolean>;
    }
  }
}

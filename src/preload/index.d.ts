import { ElectronAPI } from '@electron-toolkit/preload'
import sqlite3 from 'sqlite3'
import { Database } from 'sqlite'
import type { books } from '@/typings/database'
import type { FolderInfo, FileInfo } from '@/typings/file'
import type { VideoBookmark } from '@/typings/video-bookmarks'
import type {
  SubtitleCacheInfo,
  GenerateOptions,
  GenerateProgress,
  ModelInfo,
  SubtitleSettings,
  SubtitleSegment,
  WhisperModelName,
  TranslateTarget
} from '@/typings/subtitle'

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
      clearFavorites: (module?: string) => Promise<boolean>
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
      clearBrowseHistory: (module?: string) => Promise<boolean>;
    }
    downloadHistory: {
      addDownloadHistory: (fullPath: string, module: string) => Promise<boolean>;
      getDownloadHistory: (limit?: number, module?: string) => Promise<any[]>;
      deleteDownloadHistory: (id: number) => Promise<boolean>;
      clearDownloadHistory: (module?: string) => Promise<boolean>;
    }
    server: {
      status: () => Promise<{ running: boolean; port: number }>
      start: () => Promise<{ success: boolean; port?: number; error?: string }>
      stop: () => Promise<{ success: boolean; error?: string }>
      setResourcePath: (resourcePath: string) => Promise<{ success: boolean }>
      setVideoResourcePath: (videoResourcePath: string) => Promise<{ success: boolean }>
    }
    closeConfig: {
      get: () => Promise<{ closeToTray: boolean; dontRemind: boolean }>
      set: (config: { closeToTray: boolean; dontRemind: boolean }) => Promise<void>
      reset: () => Promise<void>
      respond: (response: { closeToTray: boolean; dontRemind: boolean }) => Promise<void>
      onShowDialog: (callback: () => void) => () => void
    }
    databaseBackup: {
      createBackup: (backupPath?: string) => Promise<string>;
      restoreBackup: (backupFilePath: string) => Promise<void>;
      getBackupList: (backupPath?: string) => Promise<Array<{ fileName: string, filePath: string, size: number, createdAt: Date }>>;
      deleteBackup: (backupFilePath: string) => Promise<void>;
      setupScheduledBackup: (intervalInWeeks: number, backupPath?: string) => NodeJS.Timeout;
      cancelScheduledBackup: (timerId: NodeJS.Timeout) => void;
      getDatabasePath: () => string;
      getBackupDirectory: (customPath?: string) => string;
    }
    clipboard: {
      readText: () => Promise<string>
    }
    windowManager: {
      create: (options?: { route?: string; title?: string; width?: number; height?: number }) => Promise<{ success: boolean }>
    }
    subtitle: {
      checkCache: (videoPath: string) => Promise<SubtitleCacheInfo>
      generate: (videoPath: string, options?: GenerateOptions) => Promise<string>
      cancelGenerate: () => Promise<void>
      parseVtt: (vttPath: string) => Promise<SubtitleSegment[]>
      getModels: () => Promise<ModelInfo[]>
      downloadModel: (modelName: WhisperModelName) => Promise<void>
      deleteModel: (modelName: WhisperModelName) => Promise<void>
      getSettings: () => Promise<SubtitleSettings>
      updateSettings: (settings: Partial<SubtitleSettings>) => Promise<void>
      clearCache: () => Promise<void>
      getStatus: () => Promise<{ isGenerating: boolean }>
      getDataInfo: () => Promise<{ dataDir: string; dataSize: number; dataSizeFormatted: string }>
      selectDataDir: () => Promise<string | null>
      migrateData: (newPath: string) => Promise<{ success: boolean }>
      onGenerateProgress: (callback: (progress: GenerateProgress) => void) => () => void
      onDownloadProgress: (callback: (progress: { model: string; percent: number; receivedBytes: number; totalBytes: number }) => void) => () => void
      onRealtimeText: (callback: (text: string, isFinal: boolean) => void) => () => void
      getBinaryStatus: () => Promise<{
        whisperInstalled: boolean
        ffmpegInstalled: boolean
        whisperPath: string
        ffmpegPath: string
      }>
      downloadWhisper: () => Promise<{ success: boolean; error?: string }>
      downloadFfmpeg: () => Promise<{ success: boolean; error?: string }>
      onBinaryDownloadProgress: (callback: (progress: {
        binary: 'whisper' | 'ffmpeg'
        percent: number
        status: 'downloading' | 'extracting' | 'done'
      }) => void) => () => void
      translate: (segments: SubtitleSegment[], from: string, to: string) => Promise<{
        success: boolean
        segments?: SubtitleSegment[]
        error?: string
      }>
      translateSingle: (text: string, from: string, to: string) => Promise<{
        success: boolean
        translated?: string
        error?: string
      }>
      clearTranslateCache: () => Promise<{ success: boolean }>
      onTranslateProgress: (callback: (progress: {
        current: number
        total: number
        percent: number
      }) => void) => () => void
      onTranslateSegment: (callback: (data: {
        segment: SubtitleSegment
        index: number
      }) => void) => () => void
      getTranslateModels: () => Promise<Array<{
        alias: string
        displayName: string
        size: string
        sizeBytes: number
        downloadUrl: string
        downloaded: boolean
        path?: string
      }>>
      downloadTranslateModel: (modelAlias: string) => Promise<{ success: boolean; error?: string }>
      deleteTranslateModel: (modelAlias: string) => Promise<{ success: boolean; error?: string }>
      onTranslateModelDownloadProgress: (callback: (progress: {
        modelAlias: string
        percent: number
        receivedBytes: number
        totalBytes: number
        status: 'downloading' | 'done'
      }) => void) => () => void
      // LLM 模块管理
      getLlmModuleStatus: () => Promise<{
        installed: boolean
        version: string | null
        installedAt: string | null
        moduleDir: string
        moduleSize: number
        moduleSizeFormatted: string
        bundledZipAvailable: boolean
      }>
      autoInstallLlmModule: () => Promise<{ success: boolean; error?: string }>
      uninstallLlmModule: () => Promise<{ success: boolean; error?: string }>
    }
    /** @electron/llm 提供的本地 LLM API */
    electronAi: {
      create: (options: {
        modelAlias: string
        systemPrompt?: string
        initialPrompts?: Array<{
          role: 'system' | 'user' | 'assistant'
          type: 'text' | 'image' | 'audio'
          content: string | ArrayBuffer
        }>
        topK?: number
        temperature?: number
      }) => Promise<void>
      destroy: () => Promise<void>
      prompt: (input: string, options?: {
        responseJSONSchema?: object
        requestUUID?: string
        timeout?: number
      }) => Promise<string>
      promptStreaming: (input: string, options?: {
        responseJSONSchema?: object
        requestUUID?: string
        timeout?: number
      }) => Promise<AsyncIterableIterator<string>>
      abortRequest: (requestUUID: string) => void
    }
  }
}

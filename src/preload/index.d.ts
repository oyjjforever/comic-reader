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
    file: {
      simpleSanitize: (filename: string, replacement?: string) => string
      [key: string]: any
    }
    appData: {
      get: (key: string) => Promise<string | undefined>
      set: (key: string, value: string) => Promise<void>
    }
    systemInterface: {
      openExplorer: (path: string) => void
      unzip: (path: string) => void
      deleteFolder: (folderPath: string) => Promise<boolean>
      /** 仅删除空文件夹（目录非空时报错，不做递归删除） */
      deleteFolderIfEmpty: (folderPath: string) => Promise<{ success: boolean; error?: string }>
      createFolder: (
        parentPath: string,
        folderName: string
      ) => Promise<{ success: boolean; error?: string }>
      movePath: (
        srcPath: string,
        destFolderPath: string
      ) => Promise<{ success: boolean; error?: string }>
    }
    media: {
      getFolderTree: (dirPath: string, noLeaf: boolean) => Promise<FolderInfo[]>
      getFolderList: (dirPath: string) => Promise<FolderInfo[]>
      getFolderListPaginated: (
        dirPath: string,
        page: number,
        pageSize: number
      ) => Promise<{ folders: FolderInfo[]; hasMore: boolean }>
      getFolderListBasic: (dirPath: string) => Promise<any[]>
      loadFolderDetails: (folderPath: string) => Promise<FolderInfo>
      getFiles: (
        dirPath: string,
        sortOptions?: any,
        filterExtensions?: string[],
        mediaType?: 'image' | 'video' | 'all'
      ) => Promise<FileInfo[]>
      getFolderInfo: (filePath: string, sortOptions?: any) => Promise<FolderInfo>
      getFolderInfoCached: (folderPath: string) => Promise<FolderInfo>
      getFileInfo: (dirPath: string) => Promise<FileInfo>
      getFolderCoverInfo: (
        filePath: string
      ) => Promise<{ coverPath?: string; coverFileName?: string }>
      clearExpiredCache: () => void
      // 工具函数
      isImageFile: (file: FileInfo) => boolean
      isVideoFile: (file: FileInfo) => boolean
      determineMediaType: (files: FileInfo[]) => 'image' | 'video' | 'mixed' | 'empty' | string
    }
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
    rating: {
      getRating: (fullPath: string, module: string) => Promise<number>
      getAllRatings: (module: string) => Promise<Record<string, number>>
      setRating: (fullPath: string, module: string, rating: number) => Promise<void>
      deleteRating: (fullPath: string, module: string) => Promise<void>
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
      updateTagsSortOrder: (tagSorts: { id: number; sortOrder: number }[]) => Promise<void>
    }
    videoBookmarks: {
      getVideoBookmarks: (videoPath: string, order?: string) => Promise<VideoBookmark[]>
      getAllVideoBookmarks: (order?: string) => Promise<VideoBookmark[]>
      addVideoBookmark: (
        videoPath: string,
        timePoint: number,
        title?: string,
        description?: string
      ) => Promise<number>
      deleteVideoBookmark: (id: number) => Promise<void>
      updateVideoBookmark: (id: number, title?: string, description?: string) => Promise<void>
      getVideoBookmarkCount: (videoPath: string) => Promise<number>
      isTimePointBookmarked: (videoPath: string, timePoint: number) => Promise<boolean>
    }
    specialAttention: {
      init: () => Promise<void>
      add: (entry: {
        source: 'pixiv' | 'jmtt' | 'twitter' | 'weibo' | 'huangguo'
        authorId: string
        authorName?: string
        extra?: any
        latestWorkTime?: number
        latestWorkId?: string
        ignoredWorkIds?: string[]
      }) => Promise<{ id: number | undefined }>
      remove: (id: number) => Promise<boolean>
      update: (
        id: number,
        patch: Partial<{
          authorName: string
          extra: any
          latestWorkTime: number
          latestWorkId: string
          ignoredWorkIds: string[]
          sort: number
        }>
      ) => Promise<boolean>
      list: () => Promise<
        Array<{
          id?: number
          source: 'pixiv' | 'jmtt' | 'twitter' | 'weibo' | 'huangguo'
          authorId: string
          authorName?: string | null
          extra?: any | null
          createdAt?: number
          latestWorkTime?: number | null
          latestWorkId?: string | null
          ignoredWorkIds?: string[]
        }>
      >
      increasePriority: (id: number, delta?: number) => Promise<boolean>
      decreasePriority: (id: number, delta?: number) => Promise<boolean>
      swapPriority: (id1: number, id2: number) => Promise<boolean>
    }
    browseHistory: {
      addBrowseHistory: (fullPath: string, module: string) => Promise<boolean>
      getBrowseHistory: (limit?: number, module?: string) => Promise<any[]>
      deleteBrowseHistory: (id: number) => Promise<boolean>
      clearBrowseHistory: (module?: string) => Promise<boolean>
      cleanupOldHistory: (maxCount?: number) => Promise<void>
    }
    downloadHistory: {
      addDownloadHistory: (fullPath: string, module: string) => Promise<boolean>
      getDownloadHistory: (limit?: number, module?: string) => Promise<any[]>
      deleteDownloadHistory: (id: number) => Promise<boolean>
      clearDownloadHistory: (module?: string) => Promise<boolean>
      cleanupOldDownloadHistory: (maxCount?: number) => Promise<void>
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
      reportActiveDownloads: (count: number) => void
      onShowDownloadDialog: (callback: (count: number) => void) => () => void
      respondDownloadClose: (response: { action: 'exit' | 'tray' }) => Promise<void>
    }
    databaseBackup: {
      createBackup: (backupPath?: string) => Promise<string>
      restoreBackup: (backupFilePath: string) => Promise<void>
      getBackupList: (
        backupPath?: string
      ) => Promise<Array<{ fileName: string; filePath: string; size: number; createdAt: Date }>>
      deleteBackup: (backupFilePath: string) => Promise<void>
      setupScheduledBackup: (intervalInWeeks: number, backupPath?: string) => NodeJS.Timeout
      cancelScheduledBackup: (timerId: NodeJS.Timeout) => void
      getDatabasePath: () => string
      getBackupDirectory: (customPath?: string) => string
    }
    clipboard: {
      readText: () => Promise<string>
    }
    windowManager: {
      create: (options?: {
        route?: string
        title?: string
        width?: number
        height?: number
      }) => Promise<{ success: boolean }>
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
      onDownloadProgress: (
        callback: (progress: {
          model: string
          percent: number
          receivedBytes: number
          totalBytes: number
        }) => void
      ) => () => void
      onRealtimeText: (callback: (text: string, isFinal: boolean) => void) => () => void
      getBinaryStatus: () => Promise<{
        whisperInstalled: boolean
        ffmpegInstalled: boolean
        whisperPath: string
        ffmpegPath: string
      }>
      downloadWhisper: () => Promise<{ success: boolean; error?: string }>
      downloadFfmpeg: () => Promise<{ success: boolean; error?: string }>
      onBinaryDownloadProgress: (
        callback: (progress: {
          binary: 'whisper' | 'ffmpeg'
          percent: number
          status: 'downloading' | 'extracting' | 'done'
        }) => void
      ) => () => void
      translate: (
        segments: SubtitleSegment[],
        from: string,
        to: string
      ) => Promise<{
        success: boolean
        segments?: SubtitleSegment[]
        error?: string
      }>
      translateSingle: (
        text: string,
        from: string,
        to: string
      ) => Promise<{
        success: boolean
        translated?: string
        error?: string
      }>
      clearTranslateCache: () => Promise<{ success: boolean }>
      onTranslateProgress: (
        callback: (progress: { current: number; total: number; percent: number }) => void
      ) => () => void
      onTranslateSegment: (
        callback: (data: { segment: SubtitleSegment; index: number }) => void
      ) => () => void
      getTranslateModels: () => Promise<
        Array<{
          alias: string
          displayName: string
          size: string
          sizeBytes: number
          downloadUrl: string
          downloaded: boolean
          path?: string
        }>
      >
      downloadTranslateModel: (modelAlias: string) => Promise<{ success: boolean; error?: string }>
      deleteTranslateModel: (modelAlias: string) => Promise<{ success: boolean; error?: string }>
      onTranslateModelDownloadProgress: (
        callback: (progress: {
          modelAlias: string
          percent: number
          receivedBytes: number
          totalBytes: number
          status: 'downloading' | 'done'
        }) => void
      ) => () => void
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
      downloadLlmModuleFromRemote: () => Promise<{ success: boolean; error?: string }>
      onLlmDownloadProgress: (
        callback: (progress: {
          status: 'downloading' | 'extracting' | 'done' | 'error'
          percent: number
          error?: string
        }) => void
      ) => () => void
      uninstallLlmModule: () => Promise<{ success: boolean; error?: string }>
    }
    videoCover: {
      get: (videoPath: string) => Promise<string | null>
      saveFromDataUrl: (videoPath: string, dataUrl: string) => Promise<string | null>
      saveFromBase64: (videoPath: string, base64: string) => Promise<string | null>
      generate: (videoPath: string, timeOffset?: number) => Promise<string | null>
      delete: (videoPath: string) => Promise<boolean>
      clearAll: () => Promise<number>
      getInfo: () => Promise<{ coverDir: string; size: number }>
    }
    videoTranscoder: {
      transcode: (
        inputPath: string
      ) => Promise<{ success: boolean; outputPath?: string; error?: string }>
      getStatus: () => Promise<{
        isRunning: boolean
        percent: number
        fps: number
        stage: 'idle' | 'probe' | 'encode' | 'done' | 'error' | 'cancelled'
        originalPath: string
        outputPath: string
        error?: string
      }>
      cancel: () => Promise<boolean>
      replaceWithFixed: (
        originalPath: string,
        fixedPath: string,
        renameToOriginal: boolean
      ) => Promise<{ success: boolean; finalPath?: string; error?: string }>
      onProgress: (
        callback: (progress: {
          currentTime: number
          totalTime: number
          percent: number
          fps: number
          stage: 'probe' | 'encode' | 'done'
        }) => void
      ) => () => void
      onComplete: (
        callback: (result: {
          success: boolean
          outputPath?: string
          originalPath?: string
          error?: string
        }) => void
      ) => () => void
    }
    missav: {
      getActresses: () => Promise<Array<{ name: string; slug: string; cover: string }>>
      getVideos: (
        slug: string,
        page?: number,
        sort?: string
      ) => Promise<{
        list: Array<{ title: string; href: string; url: string; cover: string }>
        page: number
        hasMore: boolean
      }>
      getVideoBTLinks: (dvdId: string) => Promise<
        Array<{
          magnet: string
          name: string
          size: string
          date: string
          isHd: boolean
        }>
      >
      getVideoInfo: (url: string) => Promise<{
        title: string
        coverUrl: string
        sources: Array<{ key: string; url: string; label: string }>
        m3u8Url: string
        referer: string
        origin: string
        host: string
      }>
      attachStreamHeaders: (payload: {
        referer: string
        origin: string
        hosts: string[]
      }) => Promise<boolean>
      detachStreamHeaders: () => Promise<boolean>
      checkAccess: () => Promise<boolean>
      ping: () => Promise<boolean>
    }
    huangguo: {
      getVideoInfo: (pageUrl: string) => Promise<{
        success: boolean
        error?: string
        title?: string
        contentId?: string
        m3u8Url?: string
        /** 各集 m3u8 地址（含 auth_key），键为集数 */
        episodes?: Array<{ ep: string; url: string }>
      }>
      getPageInfo: (pageUrl: string) => Promise<{
        success: boolean
        title?: string
        episodes?: number[]
        cover?: string
        error?: string
      }>
      getPlayUrl: (
        videoId: string | number,
        ep?: string | number
      ) => Promise<{
        success: boolean
        videoUrl?: string
        duration?: number
        title?: string
        error?: string
      }>
      /** 下载并解密加密图片（封面等），返回 blob URL；失败返回空串 */
      decryptImage: (url: string) => Promise<string>
      startDownload: (payload: {
        m3u8Url: string
        quality?: string
        savePath: string
        siteUrl?: string
      }) => Promise<{
        success: boolean
        error?: string
        outputPath?: string
        quality?: string
        segments?: number
        duration?: number
      }>
      cancelDownload: () => Promise<{ success: boolean; message?: string }>
      onProgress: (
        callback: (progress: { type: string; [key: string]: unknown }) => void
      ) => () => void
    }
    fanqie: {
      /** 搜索短剧（offset 翻页，每页 20 条，返回 seriesId 与展示信息；空数组即到底） */
      search: (
        query: string,
        offset?: number
      ) => Promise<
        Array<{
          bookId: string
          title: string
          subtitle?: string
          abstract?: string
          category?: string
          coverUrl?: string
          episodeCount?: number
          tagText?: string
          tagColors?: [string, string]
        }>
      >
      /** 漫剧首页 feed（"值得一看的漫剧"）：内部游标分页，首次调用拉第一页、
       *  后续调用自动翻页，到底返回空数组；重新开始前先 resetLatest */
      latest: () => Promise<
        Array<{
          bookId: string
          title: string
          subtitle?: string
          abstract?: string
          category?: string
          coverUrl?: string
          episodeCount?: number
          tagText?: string
          tagColors?: [string, string]
        }>
      >
      /** 重置漫剧 feed 会话（重新进入"最新"tab 时调用） */
      resetLatest: () => void
      /** 系列详情：标题 + 剧集表（videoId 即 all_items 的 item_id） */
      getSeries: (
        seriesId: string,
        titleHint?: string
      ) => Promise<{
        seriesId: string
        title: string
        episodes: Array<{ videoId: string; title: string; index: number }>
      }>
      /** 准备某集播放：缓存命中直接返回，否则下载+解密+缓存 */
      ensureEpisode: (
        seriesId: string,
        videoId: string,
        episodeIndex?: number,
        onProgress?: (p: {
          stage: 'resolve' | 'download' | 'decrypt' | 'done'
          got?: number
          total?: number
        }) => void
      ) => Promise<{ url: string; path: string; codec: string }>
      /** 预取下一集（后台静默，失败忽略） */
      prefetchEpisode: (seriesId: string, videoId: string, episodeIndex?: number) => void
      /** 设备状态（registered=false 或 cooldown=true 时 UI 提示重试） */
      getDeviceStatus: () => Promise<{
        registered: boolean
        cooldown: boolean
        deviceId?: string
      }>
      /** 重置设备并重新注册 */
      resetDevice: () => Promise<void>
      /** 某集是否已缓存 */
      hasEpisode: (seriesId: string, videoId: string) => Promise<boolean>
      /** 缓存统计与清理 */
      getCacheSize: () => Promise<number>
      clearCache: () => Promise<void>
      /** 本地路径 → fqvideo:// 播放地址 */
      toPlayUrl: (filePath: string) => string
      getCacheDir: () => Promise<string>
    }
    pornhub: {
      getVideoInfo: (pageUrl: string) => Promise<{
        success: boolean
        error?: string
        pageUrl?: string
        title?: string
        uploader?: string
        duration?: number
        cover?: string
        videoId?: string
        /** 按「mp4 优先、清晰度降序」排序的下载源 */
        sources?: Array<{ label: string; url: string; format: 'mp4' | 'm3u8'; quality: number }>
      }>
      getModelVideos: (pageUrl: string, page?: number) => Promise<{
        success: boolean
        error?: string
        page?: number
        hasMore?: boolean
        list?: Array<{ vkey: string; url: string; title: string; duration: string; cover: string }>
      }>
      startDownload: (payload: {
        videoUrl: string
        format: 'mp4' | 'm3u8'
        quality?: number | string
        savePath: string
        pageUrl?: string
      }) => Promise<{
        success: boolean
        error?: string
        outputPath?: string
        quality?: string
        segments?: number
        duration?: number
      }>
      cancelDownload: () => Promise<{ success: boolean; message?: string }>
      onProgress: (
        callback: (progress: { type: string; [key: string]: unknown }) => void
      ) => () => void
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
      prompt: (
        input: string,
        options?: {
          responseJSONSchema?: object
          requestUUID?: string
          timeout?: number
        }
      ) => Promise<string>
      promptStreaming: (
        input: string,
        options?: {
          responseJSONSchema?: object
          requestUUID?: string
          timeout?: number
        }
      ) => Promise<AsyncIterableIterator<string>>
      abortRequest: (requestUUID: string) => void
    }
  }
}

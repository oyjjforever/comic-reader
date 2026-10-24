import { ipcRenderer } from 'electron'
import fs from 'node:fs'
import { mobileApi, setKvStore } from './mobileApi'
import appData from '../appData'
import {
    searchDramas,
    fetchDramaEpisodes,
    fetchDramaTitle,
    ensureEpisodeFile,
    prefetchEpisode,
    fetchManjuFeed,
    resetManjuFeed,
    type DramaSearchResult,
    type DramaEpisode,
    type EpisodeDownloadProgress
} from './drama'
import { setCacheRoot, cacheSize, clearCache, getCacheRoot, hasDramaEpisode } from './cache'

/**
 * window.fanqie 门面：番茄短剧（搜索/剧集/播放缓存）。
 * 播放地址走主进程注册的 fqvideo:// 协议（dev 模式渲染页为 http 源，
 * file:// 视频源会被拦截；协议在主进程侧校验路径必须位于缓存目录内）。
 */

let cacheInit: Promise<void> | null = null

// 会话持久化到应用 sqlite kv（fqMobileSession）
setKvStore(appData)

async function ensureCacheRoot(): Promise<void> {
    if (!cacheInit) {
        cacheInit = (async () => {
            const dir = await ipcRenderer.invoke('fanqie:get-cache-dir')
            setCacheRoot(dir)
            fs.mkdirSync(dir, { recursive: true })
        })()
    }
    await cacheInit
}

export interface SeriesInfo {
    seriesId: string
    title: string
    episodes: Array<{ videoId: string; title: string; index: number }>
}

// 系列信息内存缓存（标题请求较贵，书架/详情反复打开）
const seriesCache = new Map<string, SeriesInfo>()

/** 系列详情：标题（video_detail）+ 剧集列表（all_items） */
async function getSeries(seriesId: string, titleHint?: string): Promise<SeriesInfo> {
    const hit = seriesCache.get(seriesId)
    if (hit) { return hit }
    const eps: DramaEpisode[] = await fetchDramaEpisodes(seriesId)
    let title = titleHint || ''
    if (!title) {
        try { title = (await fetchDramaTitle(seriesId)) || `短剧 ${seriesId}`; } catch { title = `短剧 ${seriesId}`; }
    }
    const info: SeriesInfo = {
        seriesId,
        title,
        episodes: eps.map((e, i) => ({ videoId: e.videoId, title: e.title || `第${i + 1}集`, index: i }))
    }
    seriesCache.set(seriesId, info)
    return info
}

export interface EpisodePrepareResult {
    /** fqvideo:// 播放地址 */
    url: string
    /** 缓存文件绝对路径 */
    path: string
    codec: string
}

/** 确保某集可播（缓存命中直接返回，否则下载+解密+缓存） */
async function ensureEpisode(
    seriesId: string,
    videoId: string,
    episodeIndex = 0,
    onProgress?: (p: EpisodeDownloadProgress) => void
): Promise<EpisodePrepareResult> {
    await ensureCacheRoot()
    const result = await ensureEpisodeFile(seriesId, videoId, episodeIndex, onProgress)
    return {
        path: result.path,
        codec: result.codec,
        url: `fqvideo://cache/${encodeURIComponent(result.path)}`
    }
}

function toPlayUrl(filePath: string): string {
    return `fqvideo://cache/${encodeURIComponent(filePath)}`
}

export default {
    /** 搜索短剧（offset 翻页，每页 20 条，空数组即到底） */
    search: (query: string, offset = 0): Promise<DramaSearchResult[]> => searchDramas(query, offset),
    /**
     * 漫剧首页 feed（"值得一看的漫剧"，fqapp 两段式）：内部维护 cell/session/游标，
     * 首次调用拉第一页，后续调用自动翻页，到底返回空数组。重新开始前先 resetLatest。
     */
    latest: (): Promise<DramaSearchResult[]> => fetchManjuFeed(),
    /** 重置漫剧 feed 会话（重新进入"最新"tab 时调用） */
    resetLatest: (): void => resetManjuFeed(),
    /** 系列详情（标题+剧集表） */
    getSeries,
    /** 准备某集播放（返回 fqvideo:// 地址） */
    ensureEpisode,
    /** 预取下一集（后台静默） */
    prefetchEpisode: (seriesId: string, videoId: string, episodeIndex = 0) =>
        { void ensureCacheRoot().then(() => prefetchEpisode(seriesId, videoId, episodeIndex)); },
    /** 设备状态：registered=false 时 UI 可提示重试注册 */
    getDeviceStatus: () => mobileApi.status(),
    /** 重置设备并重新注册（IP 风控后手动重试用） */
    resetDevice: () => { seriesCache.clear(); return mobileApi.resetDevice(); },
    /** 某集是否已缓存 */
    hasEpisode: (seriesId: string, videoId: string): Promise<boolean> =>
        ensureCacheRoot().then(() => hasDramaEpisode(seriesId, videoId)),
    /** 缓存统计与清理 */
    getCacheSize: (): Promise<number> => Promise.resolve(ensureCacheRoot().then(() => cacheSize())),
    clearCache: (): Promise<void> => Promise.resolve(ensureCacheRoot().then(() => {
        clearCache()
        seriesCache.clear()
    })),
    /** 本地路径 → 播放地址（已缓存文件直接播放用） */
    toPlayUrl,
    /** 缓存根目录（调试用） */
    getCacheDir: (): Promise<string> => ensureCacheRoot().then(() => getCacheRoot())
}

import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'
const settingStore = useSettingStore(pinia)
const { file } = window

const SITE = 'yfantasy'
const BASE = 'https://api.yfantasy.me'
const CDN = 'https://vz-e2d1520f-0ba.b-cdn.net'

/**
 * 获取作品 Feed 列表
 * @param {number} limit
 * @returns {Promise<Array>} items 数组
 */
async function fetchFeed(limit = 100) {
  const res = await fetch(`${BASE}/api/videos/feed?limit=${limit}`)
  if (!res.ok) throw new Error(`获取列表失败: HTTP ${res.status}`)
  const data = await res.json()
  return data?.items || []
}

/**
 * 获取作品详情会话
 * @param {string} videoId
 * @returns {Promise<Object>} session 对象
 */
async function fetchSession(videoId) {
  const res = await fetch(`${BASE}/api/videos/${videoId}/session`)
  if (!res.ok) throw new Error(`获取详情失败: HTTP ${res.status}`)
  return await res.json()
}

/**
 * 提取视频地址
 * @param {Object} segment 片段对象
 * @returns {string} 可播放/下载地址
 */
function getVideoUrl(segment) {
  if (!segment) return ''
  return `${CDN}/${segment.assetKey}/play_720p.mp4`
}

/**
 * 收集 session 的所有片段（currentSegment + hiddenSegments）
 * @param {Object} session fetchSession 返回对象
 * @returns {Array<{segmentIndex:number, url:string, locked:boolean}>}
 */
function collectSegments(session) {
  const segments = []
  if (session?.currentSegment) {
    segments.push({
      segmentIndex: session.currentSegment.segmentIndex ?? 0,
      url: getVideoUrl(session.currentSegment),
      locked: false
    })
  }
  if (Array.isArray(session?.hiddenSegments)) {
    for (const seg of session.hiddenSegments) {
      segments.push({
        segmentIndex: seg.segmentIndex,
        url: getVideoUrl(seg),
        locked: !!seg.locked
      })
    }
  }
  segments.sort((a, b) => a.segmentIndex - b.segmentIndex)
  return segments
}

/**
 * 添加下载任务到队列
 * @param {string} videoTitle 视频标题
 * @param {Object} session fetchSession 返回对象
 */
async function downloadVideo(videoTitle, session) {
  const baseDir = await getDefaultDownloadPath('defaultDownloadPath')
  const segments = collectSegments(session)
  const title = sanitizeTitle(videoTitle || session?.videoId)
  queue.addTask({
    site: SITE,
    title,
    type: 'video',
    payload: {
      segments,
      title,
      baseDir: `${baseDir}\\yfantasy`
    }
  })
}

/**
 * 规范化标题用于本地目录命名（与下载时保持一致）
 * @param {string} videoTitle
 * @returns {string}
 */
function sanitizeTitle(videoTitle) {
  return String(videoTitle || 'video').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
}

/**
 * 获取作品的本地下载目录
 * @param {string} videoTitle
 * @returns {string}
 */
function getDownloadDir(videoTitle) {
  const downloadPath = settingStore.setting?.defaultDownloadPath
  return `${downloadPath}\\yfantasy\\${file.simpleSanitize(sanitizeTitle(videoTitle))}`
}

/**
 * 检查作品是否已本地下载
 * @param {string} videoTitle
 * @returns {boolean}
 */
function isLocalDownloaded(videoTitle) {
  try {
    const dir = getDownloadDir(videoTitle)
    return !!dir && file.pathExists(dir)
  } catch (e) {
    console.error('检查本地下载状态失败:', e)
    return false
  }
}

export default {
  SITE,
  BASE,
  CDN,
  fetchFeed,
  fetchSession,
  getVideoUrl,
  collectSegments,
  downloadVideo,
  isLocalDownloaded,
  getDownloadDir
}

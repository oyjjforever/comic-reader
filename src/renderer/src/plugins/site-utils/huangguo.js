import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'

const settingStore = useSettingStore(pinia)

const SITE_ORIGIN = 'https://huangguoai.com'

/**
 * 判断当前 URL 是否为可下载页面
 * 视频页：https://huangguoai.com/video/<id>/ 或 /video/<id>/ep-<n>/
 * 详情页：https://huangguoai.com/detail/<id>/
 * 返回 { type, videoId }
 */
function extractPageInfo(currentUrl) {
  try {
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const vIdx = parts.indexOf('video')
    if (vIdx !== -1 && parts[vIdx + 1]) {
      return { type: 'video', videoId: parts[vIdx + 1] }
    }
    const dIdx = parts.indexOf('detail')
    if (dIdx !== -1 && parts[dIdx + 1]) {
      return { type: 'detail', videoId: parts[dIdx + 1] }
    }
    return null
  } catch {
    return null
  }
}

/** 同步读取下载根目录（不弹窗，用于卡片展示/检测） */
function getDownloadRoot() {
  return (
    settingStore.setting?.downloadPathHuangguo || settingStore.setting?.defaultDownloadPath || ''
  )
}

/** 通过视频页 HTML 获取标题、总集数与封面（单次请求）
 * 标题：<h1 class="hg-web-play__title">；总集数：data-ep-grid 选集网格；封面：img data-src（各集共用）
 */
async function fetchSeriesInfo(videoId) {
  try {
    const info = await window.huangguo.getPageInfo(`${SITE_ORIGIN}/video/${videoId}/`)
    if (info && info.success && Array.isArray(info.episodes) && info.episodes.length > 0) {
      return {
        title: info.title || '',
        episodes: info.episodes,
        cover: info.cover || ''
      }
    }
  } catch (e) {
    console.error('huangguo fetchSeriesInfo 失败:', e)
  }
  return null
}

/** 剧集标题（作为作者名），优先取页面 HTML 标题，缺失时回退到视频 ID */
function resolveSeriesTitle(authorName, series, videoId) {
  return series?.title || authorName || `huangguo_${videoId}`
}

/** 下载目录：<下载路径>/<标题> */
function getSeriesWorkDir(authorName, series, videoId) {
  const root = getDownloadRoot()
  if (!root) return ''
  return `${root}\\${window.file.simpleSanitize(resolveSeriesTitle(authorName, series, videoId))}`
}

/** 指定集是否已本地下载（文件命名：第n集.mp4） */
function isEpisodeDownloaded(workDir, epNum) {
  if (!workDir) return false
  return window.file.pathExists(`${workDir}\\${window.file.simpleSanitize(`第${epNum}集`)}.mp4`)
}

/** 加入单集下载队列，下载开始前会通过 play 接口实时获取播放地址（auth_key 有时效） */
function enqueueEpisode({ videoId, epNum, title, workDir, total, pageUrl, m3u8Url = '' }) {
  queue.addTask({
    site: 'huangguo',
    title: total > 1 ? `${title} 第${epNum}集` : title,
    type: 'video',
    payload: {
      m3u8Url,
      videoId,
      ep: epNum,
      fileName: `第${epNum}集`,
      title,
      baseDir: workDir,
      quality: '1080p',
      siteUrl: pageUrl || `${SITE_ORIGIN}/video/${videoId}/`
    }
  })
}

// ===== 特别关注：作者 = 剧集（videoId），作品 = 各集 =====

/** 获取剧集的全部集数 */
async function fetchArtworks(videoId) {
  const series = await fetchSeriesInfo(videoId)
  return series ? series.episodes : []
}

/** 分页获取各集信息（用于特别关注卡片轮播，倒序：最新一集在前） */
async function pagingImage(authorName, videoId, grid, page) {
  const start = page.index * page.size
  const eps = grid.allRows.slice().reverse().slice(start, start + page.size)
  const series = await fetchSeriesInfo(videoId)
  const workDir = getSeriesWorkDir(authorName, series, videoId)
  return eps.map((ep) => {
    const epNum = Number(ep) || 1
    const seriesTitle = series?.title || ''
    return {
      artworkId: epNum,
      videoId: String(videoId),
      title: `${seriesTitle ? seriesTitle + ' ' : ''}第${epNum}集`,
      author: seriesTitle,
      artworkType: '视频',
      pages: 1,
      cover: series?.cover || '',
      url: `${SITE_ORIGIN}/video/${videoId}/ep-${epNum}/`,
      downloaded: isEpisodeDownloaded(workDir, epNum)
    }
  })
}

/** 预览视频：解析视频页地址（/video/<id>/ep-<n>/），实时获取该集 m3u8 播放地址 */
async function previewImage(url) {
  const m = String(url || '').match(/\/video\/([^/]+)(?:\/ep-(\d+))?/)
  if (!m) throw new Error('无法解析视频地址')
  const play = await window.huangguo.getPlayUrl(m[1], m[2] || 1)
  if (!play?.success || !play?.videoUrl) {
    throw new Error(play?.error || '获取播放地址失败')
  }
  return play.videoUrl
}

/** 下载单集 */
async function downloadArtwork(authorName, videoId, ep) {
  const epNum = Number(ep) || 1
  const series = await fetchSeriesInfo(videoId)
  const baseDir = await getDefaultDownloadPath('downloadPathHuangguo')
  const title = resolveSeriesTitle(authorName, series, videoId)
  enqueueEpisode({
    videoId,
    epNum,
    title,
    workDir: `${baseDir}\\${window.file.simpleSanitize(title)}`,
    total: series?.episodes.length || 1
  })
}

/** 检查剧集是否有未下载的集数 */
async function hasNewArtwork(authorName, videoId) {
  try {
    const series = await fetchSeriesInfo(videoId)
    if (!series) return false
    const workDir = getSeriesWorkDir(authorName, series, videoId)
    return series.episodes.some((ep) => !isEpisodeDownloaded(workDir, ep))
  } catch (e) {
    return false
  }
}

/** 追更：下载全部未下载的集数 */
async function downloadNewMedia(authorName, videoId, onProgress) {
  const series = await fetchSeriesInfo(videoId)
  if (!series) return 0
  const title = resolveSeriesTitle(authorName, series, videoId)
  const workDir = getSeriesWorkDir(authorName, series, videoId)
  let count = 0
  for (const ep of series.episodes) {
    if (isEpisodeDownloaded(workDir, ep)) continue
    enqueueEpisode({ videoId, epNum: ep, title, workDir, total: series.episodes.length })
    count++
    if (onProgress) onProgress(count, ep)
  }
  return count
}

const siteView = {
  url: `${SITE_ORIGIN}/`,
  updateStatus(currentUrl) {
    const info = extractPageInfo(currentUrl)
    return {
      canDownload: !!info,
      canAttention: !!info,
      extra: {
        pageInfo: info,
        pageUrl: currentUrl
      }
    }
  },
  // 当前页面作者标识：详情页 videoId 即收藏记录的 authorId
  getAttentionKey({ extra, getCurrentUrl }) {
    const pageUrl = (getCurrentUrl && getCurrentUrl()) || extra?.pageUrl || ''
    const pageInfo = extra?.pageInfo || extractPageInfo(pageUrl)
    const videoId = pageInfo?.videoId
    return videoId ? { authorId: String(videoId) } : null
  },
  async download({ extra, getCurrentUrl, tip }) {
    const pageUrl = (getCurrentUrl && getCurrentUrl()) || extra?.pageUrl || ''
    if (!pageUrl) {
      tip.error('未获取到当前页面地址')
      return
    }

    const pageInfo = extra?.pageInfo || extractPageInfo(pageUrl)
    const videoId = pageInfo?.videoId
    if (!videoId) {
      tip.error('当前页面不是视频/详情页，无法解析视频 ID')
      return
    }

    tip.info('正在解析视频信息...')
    // 标题与总集数从页面 HTML 提取：<h1 class="hg-web-play__title"> 与 data-ep-grid 选集网格
    const pageData = await window.huangguo.getPageInfo(pageUrl)
    const title = pageData?.success ? pageData.title || '' : ''
    const episodes = pageData?.success && Array.isArray(pageData.episodes) ? pageData.episodes : []
    if (episodes.length === 0) {
      tip.error(pageData?.error || '未解析到任何可下载的集数')
      return
    }

    tip.info('正在准备下载...')
    let baseDir
    try {
      baseDir = await getDefaultDownloadPath('downloadPathHuangguo')
    } catch (e) {
      tip.error('未选择下载路径')
      return
    }

    const baseTitle = title || `huangguo_${videoId}`
    const workDir = `${baseDir}\\${window.file.simpleSanitize(baseTitle)}`

    // 加入队列前先判断是否已下载，跳过已存在的集数
    const pendingEpisodes = episodes.filter((ep) => !isEpisodeDownloaded(workDir, ep))
    const skippedCount = episodes.length - pendingEpisodes.length
    if (skippedCount > 0) {
      tip.info(`已跳过 ${skippedCount} 个已下载的集数`)
    }
    if (pendingEpisodes.length === 0) {
      tip.success('所有集数均已下载，无需重复下载')
      return
    }

    // 播放地址由下载开始前通过 play 接口实时获取（auth_key 有时效）
    pendingEpisodes.forEach((ep) => {
      enqueueEpisode({
        videoId,
        epNum: Number(ep) || 1,
        title: baseTitle,
        workDir,
        total: episodes.length,
        pageUrl
      })
    })
    tip.success(
      skippedCount > 0
        ? `已加入下载队列（${pendingEpisodes.length} 集，跳过 ${skippedCount} 集）`
        : pendingEpisodes.length > 1
          ? `已加入下载队列（共 ${pendingEpisodes.length} 集）`
          : '已加入下载队列'
    )
  },
  async addSpecialAttention({ extra, getCurrentUrl, tip }) {
    const pageUrl = (getCurrentUrl && getCurrentUrl()) || extra?.pageUrl || ''
    const pageInfo = extra?.pageInfo || extractPageInfo(pageUrl)
    const videoId = pageInfo?.videoId
    if (!videoId) {
      tip.error('当前页面不是视频/详情页，无法添加特别关注')
      return
    }

    let title = ''
    try {
      const pageData = await window.huangguo.getPageInfo(pageUrl)
      if (pageData?.success) title = pageData.title || ''
    } catch (e) {
      console.error('huangguo getPageInfo 失败:', e)
    }

    await window.specialAttention.add({
      source: 'huangguo',
      authorId: videoId,
      authorName: title || `huangguo_${videoId}`
    })
    tip.success('已添加到特别关注')
  }
}

export default {
  siteView,
  fetchArtworks,
  pagingImage,
  previewImage,
  downloadArtwork,
  hasNewArtwork,
  downloadNewMedia
}

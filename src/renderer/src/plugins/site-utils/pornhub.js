import { queue } from '@renderer/plugins/store/downloadQueue'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'

const { file } = window

// 用户/模特作品列表页：/model/<name>/videos、/pornstars/<name>/videos 等
const MODEL_PAGE_RE = /\/(model|pornstars|channels|users)\/([^/?#]+)(\/videos)?/

export const siteView = {
  url: 'https://cn.pornhub.com/',
  updateStatus(currentUrl) {
    let pathname = ''
    try {
      pathname = new URL(currentUrl).pathname
    } catch {
      /* ignore */
    }
    // 视频页：单个下载；列表页：批量下载该用户所有视频
    const canDownload =
      (currentUrl.includes('view_video.php') && currentUrl.includes('viewkey=')) ||
      MODEL_PAGE_RE.test(pathname)
    return { canDownload, canAttention: false, extra: {} }
  },
  async download({ getCurrentUrl, tip }) {
    const currentUrl = getCurrentUrl()
    let pathname = ''
    try {
      pathname = new URL(currentUrl).pathname
    } catch {
      /* ignore */
    }
    if (MODEL_PAGE_RE.test(pathname)) {
      await batchDownload(currentUrl, pathname, tip)
      return
    }
    await singleDownload(currentUrl, tip)
  }
  // pornhub 不支持特别关注，不提供 addSpecialAttention
}

/** 单视频下载：解析后立即选最优源入队 */
async function singleDownload(currentUrl, tip) {
  if (!currentUrl.includes('viewkey=')) throw new Error('无法获取视频 viewkey')

  tip.info('正在解析视频地址...')
  const info = await window.pornhub.getVideoInfo(currentUrl)
  if (!info?.success || !info.sources?.length) {
    throw new Error(info?.error || '未解析到播放地址')
  }

  // 已按「mp4 优先、清晰度降序」排序，直接取最优源
  const best = info.sources[0]
  const baseDir = await getDefaultDownloadPath('downloadPathPornhub')
  const rawName = info.title || info.videoId || 'pornhub_video'
  const fileName = file.simpleSanitize(rawName)

  queue.addTask({
    site: 'pornhub',
    title: info.title || fileName,
    type: 'video',
    payload: {
      pageUrl: currentUrl,
      videoUrl: best.url,
      format: best.format,
      quality: best.quality || 0,
      fileName,
      // 与批量下载一致：downloadPathPornhub/<上传者>/<文件名>（无上传者时存根目录）
      subDir: info.uploader || '',
      baseDir,
      cover: info.cover
    }
  })
  tip.success(`已加入下载队列（${best.label}）`)
}

/** 批量下载：翻页抓取列表页全部视频，分批入队（下载时再解析真实地址） */
async function batchDownload(currentUrl, pathname, tip) {
  const modelName = decodeURIComponent(pathname.match(MODEL_PAGE_RE)?.[2] || 'model')

  const all = []
  const seen = new Set()
  const MAX_PAGES = 100
  const MAX_VIDEOS = 500
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (all.length >= MAX_VIDEOS) break
    tip.info(`正在解析视频列表（第 ${page} 页，已收集 ${all.length} 个）...`)
    const res = await window.pornhub.getModelVideos(currentUrl, page)
    if (!res?.success) {
      if (page === 1) throw new Error(res?.error || '获取视频列表失败')
      break
    }
    let added = 0
    res.list.forEach((it) => {
      if (seen.has(it.vkey)) return
      seen.add(it.vkey)
      all.push(it)
      added++
    })
    // 末页或站点忽略分页参数（无新增）时停止
    if (!res.hasMore || added === 0) break
  }

  if (!all.length) throw new Error('未解析到可下载的视频')

  const baseDir = await getDefaultDownloadPath('downloadPathPornhub')
  // 分批入队：一次性插入大数组会触发整表排序与大规模响应式更新，批量场景易卡死渲染
  const CHUNK = 50
  for (let i = 0; i < all.length; i += CHUNK) {
    queue.addTask(
      all.slice(i, i + CHUNK).map((it) => ({
        site: 'pornhub',
        title: it.title,
        type: 'video',
        payload: {
          pageUrl: it.url,
          fileName: file.simpleSanitize(it.title),
          // 批量下载按用户名建子目录：downloadPathPornhub/<用户名>/<文件名>
          subDir: modelName,
          baseDir
        }
      }))
    )
  }
  tip.success(`已加入下载队列（${modelName} 共 ${all.length} 个视频）`)
}

export default {
  siteView
}

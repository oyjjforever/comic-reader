import { queue } from '@renderer/plugins/store/downloadQueue'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'
import { useSettingStore, pinia } from '@renderer/plugins/store'

const { file } = window

const settingStore = useSettingStore(pinia)

// 用户/模特作品列表页：/model/<name>/videos、/pornstars/<name>/videos 等
const MODEL_PAGE_RE = /\/(model|pornstars|channels|users)\/([^/?#]+)(\/videos)?/

const SITE_ORIGIN = 'https://cn.pornhub.com'

/** 从列表页/个人主页 URL 提取作者标识（type/name，如 model/alice）与列表页地址 */
function extractModelInfo(currentUrl) {
  let pathname = ''
  try {
    pathname = new URL(currentUrl).pathname
  } catch {
    return null
  }
  const m = pathname.match(MODEL_PAGE_RE)
  if (!m) return null
  const type = m[1]
  const name = decodeURIComponent(m[2])
  return {
    type,
    name,
    authorId: `${type}/${name}`,
    authorName: name,
    listUrl: `${SITE_ORIGIN}/${type}/${encodeURIComponent(name)}/videos`
  }
}

/** 由作者标识（type/name）还原列表页地址 */
function buildListUrl(authorId) {
  const idx = String(authorId || '').indexOf('/')
  if (idx === -1) return `${SITE_ORIGIN}/model/${encodeURIComponent(authorId)}/videos`
  const type = authorId.slice(0, idx)
  const name = authorId.slice(idx + 1)
  return `${SITE_ORIGIN}/${type}/${encodeURIComponent(name)}/videos`
}

/** 同步读取下载根目录（不弹窗，用于已下载检测） */
function getDownloadRoot() {
  return settingStore.setting?.downloadPathPornhub || settingStore.setting?.defaultDownloadPath || ''
}

/** 指定作品是否已本地下载（批量目录：<根>/<作者名>/<文件名>.mp4；单个下载可能在根目录/<上传者>/） */
function isLocalDownloaded(authorName, workName) {
  const root = getDownloadRoot()
  if (!root || !workName) return false
  const safeName = file.simpleSanitize(workName)
  if (authorName && file.pathExists(`${root}\\${file.simpleSanitize(authorName)}\\${safeName}.mp4`)) {
    return true
  }
  return file.pathExists(`${root}\\${safeName}.mp4`)
}

/** 翻页收集作者全部视频（按 vkey 去重，封顶 maxVideos） */
async function collectModelVideos(listUrl, { maxPages = 100, maxVideos = 500, onPage } = {}) {
  const all = []
  const seen = new Set()
  for (let page = 1; page <= maxPages; page++) {
    if (all.length >= maxVideos) break
    const res = await window.pornhub.getModelVideos(listUrl, page)
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
    onPage?.(page, all.length)
    // 末页或站点忽略分页参数（无新增）时停止
    if (!res.hasMore || added === 0) break
  }
  return all
}

/** 分批入队：一次性插入大数组会触发整表排序与大规模响应式更新，批量场景易卡死渲染 */
function enqueueModelVideos(videos, subDir, baseDir) {
  const CHUNK = 50
  for (let i = 0; i < videos.length; i += CHUNK) {
    queue.addTask(
      videos.slice(i, i + CHUNK).map((it) => ({
        site: 'pornhub',
        title: it.title,
        type: 'video',
        payload: {
          pageUrl: it.url,
          fileName: file.simpleSanitize(it.title),
          // 批量下载按用户名建子目录：downloadPathPornhub/<用户名>/<文件名>
          subDir,
          baseDir
        }
      }))
    )
  }
}

// ===== 特别关注：作者 = 模特/女星/频道/用户，作品 = 视频 =====

/** 获取作者全部视频（封顶 10 页 / 300 个，防超大账号拖垮卡片加载与检测） */
async function fetchArtworks(authorId) {
  return await collectModelVideos(buildListUrl(authorId), { maxPages: 10, maxVideos: 300 })
}

/** 分页获取视频卡片（作者卡轮播，列表页默认最新在前） */
async function pagingImage(authorName, authorId, grid, page) {
  const start = page.index * page.size
  const videos = grid.allRows.slice(start, start + page.size)
  return videos.map((it) => ({
    artworkId: it.vkey,
    title: it.title,
    author: authorName,
    artworkType: '视频',
    pages: 1,
    cover: it.cover,
    url: it.url,
    downloaded: isLocalDownloaded(authorName, it.title)
  }))
}

/** 预览视频：解析页面取播放地址（优先 m3u8，走 hls.js + 流头注入，避免 mp4 直链防盗链/跨域） */
async function previewImage(url) {
  const info = await window.pornhub.getVideoInfo(url)
  if (!info?.success || !info.sources?.length) {
    throw new Error(info?.error || '未解析到播放地址')
  }
  const hls = info.sources
    .filter((s) => s.format === 'm3u8')
    .sort((a, b) => b.quality - a.quality)[0]
  return (hls || info.sources[0]).url
}

/** 下载单个视频：只带 pageUrl 入队，下载开始时再解析真实地址（避免直链过期） */
async function downloadArtwork(authorName, pageUrl, title) {
  const baseDir = await getDefaultDownloadPath('downloadPathPornhub')
  queue.addTask({
    site: 'pornhub',
    title: title || 'pornhub_video',
    type: 'video',
    payload: {
      pageUrl,
      fileName: file.simpleSanitize(title || `pornhub_${Date.now()}`),
      subDir: authorName || '',
      baseDir
    }
  })
}

/** 下载作者全部视频 */
async function downloadAllMedia(authorName, authorId) {
  const all = await collectModelVideos(buildListUrl(authorId))
  if (!all.length) throw new Error('未解析到可下载的视频')
  const baseDir = await getDefaultDownloadPath('downloadPathPornhub')
  const info = extractModelInfo(buildListUrl(authorId))
  enqueueModelVideos(all, authorName || info?.name || '', baseDir)
}

/** 追更：从新到旧入队未下载视频，连续 5 个已下载则停（标题本地匹配，误判由阈值兜底） */
async function downloadNewMedia(authorName, authorId, onProgress) {
  const listUrl = buildListUrl(authorId)
  const baseDir = await getDefaultDownloadPath('downloadPathPornhub')
  const modelName = authorName || extractModelInfo(listUrl)?.name || ''
  let count = 0
  let consecutive = 0
  const seen = new Set()
  for (let page = 1; page <= 20 && consecutive < 5; page++) {
    const res = await window.pornhub.getModelVideos(listUrl, page)
    if (!res?.success) break
    let added = 0
    for (const it of res.list || []) {
      if (seen.has(it.vkey)) continue
      seen.add(it.vkey)
      added++
      if (isLocalDownloaded(authorName, it.title)) {
        consecutive++
        if (consecutive >= 5) break
      } else {
        consecutive = 0
        queue.addTask({
          site: 'pornhub',
          title: it.title,
          type: 'video',
          payload: {
            pageUrl: it.url,
            fileName: file.simpleSanitize(it.title),
            subDir: modelName,
            baseDir
          }
        })
        count++
        onProgress?.(count, it.vkey)
      }
    }
    if (!res.hasMore || added === 0) break
  }
  return count
}

/** 检查作者是否有未下载的新视频（首页第一个视频未下载即视为有新作品） */
async function hasNewArtwork(authorName, authorId) {
  try {
    const res = await window.pornhub.getModelVideos(buildListUrl(authorId), 1)
    const first = res?.success ? res.list?.[0] : null
    if (!first) return false
    return !isLocalDownloaded(authorName, first.title)
  } catch {
    return false
  }
}

export const siteView = {
  url: `${SITE_ORIGIN}/`,
  updateStatus(currentUrl) {
    let pathname = ''
    try {
      pathname = new URL(currentUrl).pathname
    } catch {
      /* ignore */
    }
    const isModelPage = MODEL_PAGE_RE.test(pathname)
    // 视频页：单个下载；列表页：批量下载该用户所有视频 + 特别关注
    const canDownload =
      (currentUrl.includes('view_video.php') && currentUrl.includes('viewkey=')) || isModelPage
    return { canDownload, canAttention: isModelPage, extra: {} }
  },
  // 当前页面作者标识：路径 type/name（如 model/alice），兼容无 /videos 后缀的个人主页
  getAttentionKey({ getCurrentUrl }) {
    const info = extractModelInfo(getCurrentUrl?.() || '')
    if (!info) return null
    return { authorId: info.authorId, authorName: info.authorName }
  },
  async download({ getCurrentUrl, tip }) {
    const currentUrl = getCurrentUrl()
    await batchDownload(currentUrl, tip)
  },
  async addSpecialAttention({ getCurrentUrl, tip }) {
    const info = extractModelInfo(getCurrentUrl?.() || '')
    if (!info) {
      tip.error('当前页面不是作者列表页，无法添加特别关注')
      return
    }
    await window.specialAttention.add({
      source: 'pornhub',
      authorId: info.authorId,
      authorName: info.authorName
    })
    tip.success('已添加到特别关注')
  }
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
async function batchDownload(currentUrl, tip) {
  const info = extractModelInfo(currentUrl)
  if (!info) {
    // 非列表页回落到单视频下载
    await singleDownload(currentUrl, tip)
    return
  }

  const all = await collectModelVideos(info.listUrl, {
    onPage: (page, count) => tip.info(`正在解析视频列表（第 ${page} 页，已收集 ${count} 个）...`)
  })
  if (!all.length) throw new Error('未解析到可下载的视频')

  const baseDir = await getDefaultDownloadPath('downloadPathPornhub')
  enqueueModelVideos(all, info.name, baseDir)
  tip.success(`已加入下载队列（${info.name} 共 ${all.length} 个视频）`)
}

export default {
  siteView,
  fetchArtworks,
  pagingImage,
  previewImage,
  downloadArtwork,
  downloadAllMedia,
  downloadNewMedia,
  hasNewArtwork,
  isLocalDownloaded
}

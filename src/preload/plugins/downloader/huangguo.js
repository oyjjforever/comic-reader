import Api from './api.js'
import crypto from 'crypto'
import { ipcRenderer } from 'electron'
import HlsDownloader from './hls.js'

const SITE_ORIGIN = 'https://huangguoai.com'

const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})

// ===== 图片解密参数（与站点 crypto-worker 一致）=====
// 算法：AES-128-CBC + NoPadding；密文为 Base64 文本
// media_key / media_iv 数字串按 charCode 还原：
//   102_53_..._48 -> "f5d965df75336270"
//   57_55_..._49  -> "97b60394abc2fbe1"
const MEDIA_KEY = Buffer.from('f5d965df75336270', 'utf8')
const MEDIA_IV = Buffer.from('97b60394abc2fbe1', 'utf8')

/** 已解密图片的 blob URL 缓存（原始 URL -> blob URL） */
const decryptedImageCache = new Map()

/**
 * 下载并解密加密图片（封面等），返回可直接展示的 blob URL
 * CDN 返回的 body 是 Base64 文本（密文），解密后为图片二进制
 */
async function decryptImage(url) {
  if (!url) return ''
  if (decryptedImageCache.has(url)) return decryptedImageCache.get(url)
  try {
    const res = await api.get({
      url,
      responseType: 'arraybuffer',
      headers: { Referer: `${SITE_ORIGIN}/` },
      timeout: 30000
    })
    const raw = Buffer.from(res)
    if (raw.length === 0) throw new Error('远程图片资源为空')

    // 响应体即二进制密文（worker 中是先 readAsDataURL 转 base64 再喂给 CryptoJS 的），
    // 直接作为 AES-128-CBC-NoPadding 密文解密
    const decipher = crypto.createDecipheriv('aes-128-cbc', MEDIA_KEY, MEDIA_IV)
    decipher.setAutoPadding(false)
    const plain = Buffer.concat([decipher.update(raw), decipher.final()])
    if (plain.length === 0) throw new Error('解密结果为空')

    const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase()
    const blob = new Blob([plain], { type: `image/${ext}` })
    const blobUrl = URL.createObjectURL(blob)
    decryptedImageCache.set(url, blobUrl)
    return blobUrl
  } catch (err) {
    console.error('huangguo 图片解密失败:', url, err?.message)
    return ''
  }
}

/** 解码 HTML 实体（&amp; &lt; &#xxx; 等） */
function decodeHtmlEntities(text) {
  if (!text) return ''
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' '
  }
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-z]+;/gi, (m) => entities[m] ?? m)
}

/** 读取 persist:thirdparty 分区中 huangguoai.com 的 Cookie */
async function getCookies() {
  const cookies = await ipcRenderer.invoke('site:getCookies')
  if (!Array.isArray(cookies)) return ''
  return cookies
    .filter((_) => (_.domain || '').includes('huangguo'))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

/** 构造带 Referer / Cookie 的请求头 */
async function buildHeaders(siteUrl) {
  let referer = siteUrl
  try {
    referer = new URL(siteUrl).origin + '/'
  } catch {
    /* ignore */
  }
  const headers = { Referer: referer }
  const cookieStr = await getCookies()
  if (cookieStr) headers['Cookie'] = cookieStr
  return headers
}

/**
 * 解析视频页 / 详情页 HTML
 * 视频页（/video/<id>/）：从 videoInitialData JSON 提取标题、各集 m3u8 地址（含 auth_key）
 * 详情页（/detail/<id>/）：无 videoInitialData，从 data-ep-grid 选集网格提取各集 ID
 */
async function getVideoInfo(pageUrl) {
  if (!pageUrl) return { success: false, error: '缺少页面地址' }
  try {
    const headers = await buildHeaders(pageUrl)
    const html = await api.get({ url: pageUrl, headers, timeout: 30000, responseType: 'text' })

    // 从 URL 提取视频 ID（/video/<id>/ 或 /detail/<id>/）
    const pathParts = new URL(pageUrl).pathname.split('/').filter(Boolean)
    const vIdx = pathParts.indexOf('video')
    const dIdx = pathParts.indexOf('detail')
    const idFromUrl =
      (vIdx !== -1 && pathParts[vIdx + 1]) || (dIdx !== -1 && pathParts[dIdx + 1]) || ''

    const jsonRaw = html.match(
      /<script id="videoInitialData" type="application\/json">([\s\S]*?)<\/script>/
    )?.[1]

    if (jsonRaw) {
      const data = JSON.parse(jsonRaw)
      const title = decodeHtmlEntities(String(data.title || '').trim())
      const contentId = String(data.id || idFromUrl)

      // epPlaySrcs: { "1": m3u8Url, "2": m3u8Url, ... }，键为集数
      const episodes = Object.entries(data.epPlaySrcs || {})
        .map(([ep, url]) => ({ ep, url: String(url) }))
        .filter((e) => e.url)
        .sort((a, b) => Number(a.ep) - Number(b.ep))

      // 当前集（ep 字段）优先，否则取第一集
      const currentEp = String(data.ep ?? '')
      const m3u8Url =
        episodes.find((e) => e.ep === currentEp)?.url ||
        episodes[0]?.url ||
        String(data.videoSrc || '')

      return { success: true, title, contentId, m3u8Url, episodes }
    }

    // 详情页：解析选集网格 <div class="hg_web_detail__ep-grid" data-ep-grid>...<a data-ep-id="1">01</a>...
    const epGridHtml = html.match(/<div[^>]*data-ep-grid[^>]*>([\s\S]*?)<\/div>/)?.[1] || ''
    const eps = [...epGridHtml.matchAll(/data-ep-id="(\d+)"/g)].map((m) => m[1])
    if (eps.length === 0) return { success: false, error: '未在页面中解析到视频或选集信息' }

    // 标题回退 og:title / <title>
    const title = decodeHtmlEntities(
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
        html.match(/<title>([^<]*)<\/title>/i)?.[1] ||
        ''
    ).trim()

    // 各集地址由下载开始前通过 play 接口实时获取（auth_key 有时效）
    const episodes = eps.map((ep) => ({ ep, url: '' }))
    return { success: true, title, contentId: idFromUrl, m3u8Url: '', episodes }
  } catch (err) {
    console.error('huangguo 解析视频信息失败:', err?.message)
    return { success: false, error: err?.message || '获取视频信息失败' }
  }
}

/**
 * 从视频页 HTML 提取作品信息（单次请求）
 * 标题：<h1 class="hg-web-play__title">...</h1>
 * 总集数：<div class="hg-web-play__ep-grid"> 内的 <a data-ep-id="n">
 * 封面：<img ... data-src="...">（各集共用同一封面）
 */
async function getPageInfo(pageUrl) {
  if (!pageUrl) return { success: false, error: '缺少页面地址' }
  try {
    const headers = await buildHeaders(pageUrl)
    const html = await api.get({ url: pageUrl, headers, timeout: 30000, responseType: 'text' })

    const title = decodeHtmlEntities(
      html.match(/<h1[^>]*class="[^"]*hg-web-play__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ||
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
        html.match(/<title>([^<]*)<\/title>/i)?.[1] ||
        ''
    ).trim()

    // 选集网格解析总集数
    const epGridHtml = html.match(/<div[^>]*hg-web-play__ep-grid[^>]*>([\s\S]*?)<\/div>/)?.[1] || ''
    const episodes = [...epGridHtml.matchAll(/data-ep-id="(\d+)"/g)].map((m) => Number(m[1]))

    // 封面：优先取 alt 与标题一致的懒加载图，否则取第一张带 data-src 的图
    let cover = ''
    for (const m of html.matchAll(/<img[^>]*>/g)) {
      const tag = m[0]
      const dataSrc = tag.match(/\bdata-src="([^"]+)"/)?.[1]
      if (!dataSrc) continue
      const alt = decodeHtmlEntities(tag.match(/\balt="([^"]*)"/)?.[1] || '').trim()
      if (!cover) cover = dataSrc
      if (title && alt === title) {
        cover = dataSrc
        break
      }
    }

    if (!title && episodes.length === 0) {
      return { success: false, error: '未在页面中解析到作品信息' }
    }
    // 封面是加密图片，解密为 blob URL 后返回（失败时回退空串，渲染层显示占位图）
    const coverUrl = await decryptImage(cover)
    return { success: true, title, episodes, cover: coverUrl }
  } catch (err) {
    console.error('huangguo 解析页面信息失败:', err?.message)
    return { success: false, error: err?.message || '获取页面信息失败' }
  }
}

/**
 * 调用 play 接口获取指定集的实时播放地址（auth_key 有时效，下载前需实时获取）
 * GET https://huangguoai.com/api/videos/<videoId>/play?ep=<ep>
 */
async function getPlayUrl(videoId, ep) {
  if (!videoId) return { success: false, error: '缺少视频 ID' }
  try {
    const apiUrl = `${SITE_ORIGIN}/api/videos/${videoId}/play?ep=${ep ?? 1}`
    const headers = await buildHeaders(apiUrl)
    const body = await api.get({ url: apiUrl, headers, timeout: 30000 })
    const videoUrl = body?.data?.video_url
    if (body?.status !== 1 || !videoUrl) {
      return { success: false, error: body?.msg || 'play 接口未返回播放地址' }
    }
    return { success: true, videoUrl, duration: body.data.duration, title: body.data.title }
  } catch (err) {
    console.error('huangguo 获取播放地址失败:', err?.message)
    return { success: false, error: err?.message || '获取播放地址失败' }
  }
}

// ===== HLS 下载（preload 内直接执行，无需主进程 huangguo:* IPC）=====
let currentDownloader = null
const progressListeners = new Set()

function notifyProgress(progress) {
  for (const callback of progressListeners) {
    try {
      callback(progress)
    } catch {
      /* ignore */
    }
  }
}

/** 下载 HLS 视频：在 preload 中下载解密片段并封装为 MP4，进度通过 onProgress 订阅回调推送 */
async function startDownload(payload) {
  const { m3u8Url, savePath } = payload || {}
  const quality = payload?.quality || '1080p'
  const siteUrl = payload?.siteUrl || m3u8Url
  if (!m3u8Url || !savePath) {
    return { success: false, error: '缺少必要参数（m3u8Url / savePath）' }
  }

  try {
    const headers = await buildHeaders(siteUrl)
    headers['User-Agent'] = navigator.userAgent
    currentDownloader = new HlsDownloader(m3u8Url, headers, {
      concurrency: 8,
      timeout: 60000
    })

    const result = await currentDownloader.download(quality, savePath, notifyProgress)
    return { success: true, ...result }
  } catch (err) {
    console.error('huangguo 下载失败:', err?.message)
    return { success: false, error: err?.message || '下载失败' }
  } finally {
    currentDownloader = null
  }
}

export default {
  getVideoInfo,
  getPageInfo,
  getPlayUrl,
  decryptImage,
  startDownload,
  cancelDownload: async () => {
    if (currentDownloader) {
      currentDownloader.cancel()
      return { success: true }
    }
    return { success: false, message: '没有正在进行的下载' }
  },
  onProgress: (callback) => {
    progressListeners.add(callback)
    return () => progressListeners.delete(callback)
  }
}

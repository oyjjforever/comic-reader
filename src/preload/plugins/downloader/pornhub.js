/**
 * pornhub 站点视频下载插件
 * 数据源参考 docs/ph-video-downloader-plugin-analysis.md（Chrome 扩展逆向）：
 * - 视频页内联 flashvars_XXXXX JSON，mediaDefinitions 含 mp4 直链 / hls master / json 清单
 * - m3u8 下载复用 downloader/hls.js（分片并发 + AES-128 + ffmpeg 转封装）
 * - mp4 直链流式下载（Range 断点续传 + AbortController 取消）
 * - 传输层复用 4khd/missav 的镜像轮询 + 重定向自动发现
 */
import Api from './api.js'
import HlsDownloader from './hls.js'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import http from 'http'
import https from 'https'
import { ipcRenderer } from 'electron'

// 入口与镜像域名：区域域名被墙/跳转时由重定向自动发现补充（进程内生效）
const MIRRORS = ['www.pornhub.com', 'cn.pornhub.com']
const discoveredHosts = new Set()
const REDIRECT_STATUS = [301, 302, 303, 307, 308]
let activeHost = MIRRORS[0]

const PROXY = { protocol: 'http', host: '127.0.0.1', port: 7890 }

const api = new Api({ proxyMode: 'Custom', proxyHost: '127.0.0.1', proxyPort: '7890' })

// 大文件流式下载 / HLS 分片下载用 axios 实例（走代理，参考 hls.js 的 agent 配置）
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 20, keepAliveMsecs: 30000 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20, keepAliveMsecs: 30000 })
const streamClient = axios.create({
  adapter: 'http',
  httpAgent,
  httpsAgent,
  proxy: PROXY
})

// ===== 通用工具 =====

function urlHost(u) {
  try {
    return new URL(u).host
  } catch {
    return ''
  }
}

/** 替换 URL 的 host（保留 scheme/path/query） */
function swapHost(url, host) {
  try {
    const u = new URL(url)
    u.host = host
    return u.toString()
  } catch {
    return url
  }
}

/** 解析 Location 头为绝对 URL */
function resolveLocation(location, base) {
  try {
    return new URL(location, base).toString()
  } catch {
    return ''
  }
}

/** 记录重定向发现的新镜像 host（设上限防止重定向链膨胀） */
function recordDiscoveredHost(host) {
  if (!host || MIRRORS.includes(host) || discoveredHosts.has(host)) return false
  if (discoveredHosts.size >= 8) return false
  discoveredHosts.add(host)
  console.log('[pornhub] discovered mirror host:', host)
  return true
}

/** 解码 HTML 实体（&amp; &#xXX; 等） */
function decode(text) {
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
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-z]+;/gi, (m) => entities[m.toLowerCase()] ?? m)
    .trim()
}

/** Cloudflare 拦截页判定（参考 missav.isCfInterstitial） */
function isCfInterstitial(resp) {
  const status = resp?.status ?? 0
  if ([403, 429, 503].includes(status)) return true
  const body = typeof resp?.data === 'string' ? resp.data.slice(0, 3000) : ''
  if (/just a moment|cf-browser-verification|cf_chl_/.test(body)) return true
  return false
}

/** 读取 persist:thirdparty 分区中 pornhub 域的 Cookie（登录态可解锁更高清晰度） */
async function getCookies() {
  try {
    const cookies = await ipcRenderer.invoke('site:getCookies')
    if (!Array.isArray(cookies)) return ''
    return cookies
      .filter((_) => (_.domain || '').includes('pornhub'))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
  } catch {
    return ''
  }
}

/** 构造带 Referer / Cookie / UA 的请求头（媒体 CDN 校验必需） */
async function buildHeaders(pageUrl) {
  const referer = pageUrl || `https://${activeHost}/`
  const headers = {
    Referer: referer,
    'User-Agent': navigator.userAgent
  }
  const cookie = await getCookies()
  if (cookie) headers['Cookie'] = cookie
  return headers
}

// ===== 镜像轮询（重定向手动逐跳跟随，捕获站点更换的新域名） =====

async function fetchWithMirrors(url, { validate, headers } = {}) {
  const ordered = []
  const pushUnique = (h) => {
    if (h && !ordered.includes(h)) ordered.push(h)
  }
  pushUnique(activeHost)
  MIRRORS.forEach(pushUnique)
  discoveredHosts.forEach(pushUnique)

  for (const host of ordered) {
    let targetUrl = url.startsWith('http') ? swapHost(url, host) : `https://${host}${url}`
    let resp = null
    let finalHost = host

    // 手动跟随重定向（最多 5 跳）；单跳内对传输错误重试 1 次
    for (let hop = 0; hop < 5; hop++) {
      const refererHost = urlHost(targetUrl) || host
      resp = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          resp = await api.rawGet({
            url: targetUrl,
            headers: { Referer: `https://${refererHost}/`, ...(headers || {}) },
            timeout: 20000
          })
          break
        } catch (e) {
          if (attempt === 1) console.warn('[pornhub] transport error', refererHost, e.message)
        }
      }
      if (!resp) break
      if (!REDIRECT_STATUS.includes(resp.status)) break

      const next = resolveLocation(resp.headers?.location, targetUrl)
      if (!next) break
      const nextHost = urlHost(next)
      if (nextHost) {
        if (recordDiscoveredHost(nextHost)) pushUnique(nextHost)
        finalHost = nextHost
      }
      targetUrl = next
    }

    if (!resp) continue
    if (isCfInterstitial(resp)) continue
    if (validate && !validate(resp)) continue
    activeHost = finalHost
    return resp
  }
  return null
}

/** 带 CDN 请求头直取文本（master m3u8 / json 清单） */
async function fetchText(url, pageUrl) {
  const headers = await buildHeaders(pageUrl)
  const resp = await api.rawGet({ url, headers, timeout: 20000 })
  if (resp.status !== 200 || typeof resp.data !== 'string') {
    throw new Error(`资源获取失败（HTTP ${resp.status}）`)
  }
  return resp.data
}

// ===== flashvars 解析 =====

/** 从 str[startIdx]（指向 '{'）括号配对提取 JSON 字符串（字符串内可能含花括号/转义） */
function extractBalancedJson(str, startIdx) {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = startIdx; i < str.length; i++) {
    const c = str[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return str.substring(startIdx, i + 1)
    }
  }
  return null
}

/** 从视频页 HTML 提取 flashvars_XXXXX 对象（逐个尝试赋值点直至 JSON.parse 成功） */
function extractFlashvars(html) {
  const re = /flashvars_[0-9]{1,}\s*=\s*\{/g
  let m
  while ((m = re.exec(html)) !== null) {
    const json = extractBalancedJson(html, m.index + m[0].length - 1)
    if (!json) continue
    try {
      const obj = JSON.parse(json)
      if (obj && Array.isArray(obj.mediaDefinitions)) return obj
    } catch {
      /* 尝试下一个赋值点 */
    }
  }
  return null
}

/** 解析 master m3u8 为清晰度变体列表（按分辨率/带宽降序） */
function parseHlsVariants(text, baseUrl) {
  const lines = text.split('\n')
  const variants = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue
    const next = lines[i + 1]?.trim()
    if (!next || next.startsWith('#')) continue
    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/)
    const height = resMatch ? Number(resMatch[2]) : 0
    const bandwidth = parseInt(line.match(/BANDWIDTH=(\d+)/)?.[1] || '0', 10)
    variants.push({ url: new URL(next, baseUrl).href, height, bandwidth })
  }
  variants.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth)
  return variants
}

/**
 * 将 mediaDefinitions 展开为可下载源列表
 * - hls：拉 master 播放列表展开各清晰度子播放列表
 * - mp4：.mp4 直链直接收录；json 清单（get_media_source）拉取后展开
 * 去重后按「mp4 优先、清晰度降序」排序
 */
async function buildSources(mediaDefinitions, pageUrl) {
  const sources = []
  for (const def of mediaDefinitions || []) {
    const fmt = String(def.format || '').toLowerCase()
    const url = String(def.videoUrl || '')
    if (!url) continue

    if (fmt === 'hls') {
      let variants = []
      try {
        variants = parseHlsVariants(await fetchText(url, pageUrl), url)
      } catch (e) {
        console.warn('[pornhub] master m3u8 获取失败，按单源处理:', e?.message)
      }
      if (variants.length) {
        variants.forEach((v) =>
          sources.push({
            label: v.height ? `${v.height}P` : 'HLS',
            url: v.url,
            format: 'm3u8',
            quality: v.height
          })
        )
      } else {
        sources.push({ label: 'HLS', url, format: 'm3u8', quality: 0 })
      }
    } else if (fmt === 'mp4') {
      if (/\.mp4(\?|$)/i.test(url)) {
        const q = parseInt(def.quality, 10) || 0
        sources.push({ label: q ? `${q}P` : 'MP4', url, format: 'mp4', quality: q })
      } else {
        // json 清单：返回各清晰度 mp4 直链数组
        try {
          const arr = JSON.parse(await fetchText(url, pageUrl))
          for (const it of arr || []) {
            const u = String(it.videoUrl || '')
            if (!/\.mp4(\?|$)/i.test(u)) continue
            const q = parseInt(it.quality, 10) || 0
            sources.push({ label: q ? `${q}P` : 'MP4', url: u, format: 'mp4', quality: q })
          }
        } catch (e) {
          console.warn('[pornhub] mp4 清单获取失败:', e?.message)
        }
      }
    }
  }

  // 按 url 去重（保序）
  const seen = new Set()
  const unique = sources.filter((s) => {
    if (seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
  // mp4 优先（单文件更稳），其次按清晰度降序
  return unique.sort(
    (a, b) => (b.format === 'mp4' ? 1 : 0) - (a.format === 'mp4' ? 1 : 0) || b.quality - a.quality
  )
}

/**
 * 解析视频页：标题、上传者、封面、时长与各清晰度下载源
 * @param {string} pageUrl 视频页地址（view_video.php?viewkey=...）
 */
async function getVideoInfo(pageUrl) {
  if (!pageUrl) return { success: false, error: '缺少页面地址' }
  try {
    // 带 Cookie（登录态可解锁更高清晰度）与 UA
    const pageHeaders = await buildHeaders()
    const resp = await fetchWithMirrors(pageUrl, {
      headers: pageHeaders,
      validate: (r) =>
        r.status === 200 && typeof r.data === 'string' && /flashvars_[0-9]+/.test(r.data)
    })
    if (!resp) {
      return { success: false, error: '视频页获取失败（可能需要代理或人机验证）' }
    }
    const html = resp.data

    const flashvars = extractFlashvars(html)
    if (!flashvars) {
      return { success: false, error: '未找到 flashvars（可能为付费视频或页面结构变化）' }
    }

    const title =
      decode(flashvars.video_title) ||
      decode(html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1]) ||
      decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]?.split(/\s*[|\-–]\s*/)[0])
    // 上传者提取链：flashvars.video_uploader（部分页面缺失）
    // -> dataLayer 的 video_uploader_name -> usernameBadgesWrapper 锚点文本
    const uploader =
      decode(flashvars.video_uploader?.username || '') ||
      decode(html.match(/'video_uploader_name'\s*:\s*'([^']+)'/)?.[1] || '') ||
      decode(html.match(/usernameBadgesWrapper">\s*<a[^>]*>([^<]+)<\/a>/)?.[1] || '')
    const duration = Number(flashvars.video_duration || 0)
    const cover = decode(
      flashvars.image_url ||
        html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
        ''
    )
    const videoId =
      String(flashvars.video_id || '') ||
      decodeURIComponent(String(flashvars.link_url || pageUrl)).match(/viewkey=([^&]+)/)?.[1] ||
      ''

    const sources = await buildSources(flashvars.mediaDefinitions, `https://${activeHost}/`)
    if (!sources.length) {
      return { success: false, error: '未解析到可下载的播放地址（登录后可能解锁更多清晰度）' }
    }

    return { success: true, pageUrl, title, uploader, duration, cover, videoId, sources }
  } catch (err) {
    console.error('[pornhub] 解析视频信息失败:', err?.message)
    return { success: false, error: err?.message || '获取视频信息失败' }
  }
}

// ===== 用户/模特作品列表（批量下载用） =====

/**
 * 解析 model/pornstars 列表页 HTML 为视频条目（li.pcVideoListItem）
 * 用正则分块解析而非 DOMParser：PH 页面 1.6MB+，在 preload（与渲染进程同进程）建整页 DOM
 * 内存开销大且不可控，批量翻页时易拖垮渲染进程
 */
function parseModelVideoList(html) {
  const items = []
  const seen = new Set()
  const matches = [...String(html).matchAll(/<li\b[^>]*\bpcVideoListItem[^>]*>/g)]

  for (let i = 0; i < matches.length; i++) {
    // 条目内部不会嵌套同类 li：块取到下一个条目起点（末条限长防越界）
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : Math.min(html.length, start + 8000)
    const block = html.slice(start, end)

    const href = decode(block.match(/href="([^"]*view_video\.php\?viewkey=[^"]*)"/)?.[1] || '')
    if (!href) continue
    const url = href.startsWith('http')
      ? href
      : `https://${activeHost}${href.startsWith('/') ? '' : '/'}${href}`

    const vkey =
      matches[i][0].match(/data-video-vkey="([^"]+)"/)?.[1] ||
      url.match(/viewkey=([^&]+)/)?.[1] ||
      url
    if (seen.has(vkey)) continue

    const title =
      decode(
        block.match(/view_video\.php\?viewkey=[^"]*"[^>]*\btitle="([^"]*)"/)?.[1] ||
          block.match(/<img[^>]*\balt="([^"]*)"/)?.[1] ||
          ''
      ) || vkey
    const duration = decode(block.match(/<var[^>]*class="duration"[^>]*>([^<]*)<\/var>/)?.[1] || '')
    const cover = decode(
      block.match(/<img[^>]*\bdata-image="([^"]+)"/)?.[1] ||
        block.match(/<img[^>]*\bsrc="([^"]+)"/)?.[1] ||
        ''
    )

    seen.add(vkey)
    items.push({ vkey, url, title, duration, cover })
  }
  return items
}

/**
 * 分页获取用户/模特的作品视频列表
 * @param {string} pageUrl 列表页地址（/model/<name>/videos 等）
 * @param {number} page 页码（从 1 开始，站点分页参数为 ?page=n）
 */
async function getModelVideos(pageUrl, page = 1) {
  if (!pageUrl) return { success: false, error: '缺少页面地址' }
  try {
    const sep = pageUrl.includes('?') ? '&' : '?'
    const target = page > 1 ? `${pageUrl}${sep}page=${page}` : pageUrl
    const pageHeaders = await buildHeaders()
    const resp = await fetchWithMirrors(target, {
      headers: pageHeaders,
      validate: (r) => r.status === 200 && typeof r.data === 'string' && r.data.length > 0
    })
    if (!resp) {
      return { success: false, error: '视频列表获取失败（可能需要代理或人机验证）' }
    }
    const list = parseModelVideoList(resp.data)
    return { success: true, list, page, hasMore: list.length > 0 }
  } catch (err) {
    console.error('[pornhub] 获取视频列表失败:', err?.message)
    return { success: false, error: err?.message || '获取视频列表失败' }
  }
}

// ===== 下载执行 =====

let currentDownloader = null // HlsDownloader
let currentCancel = null // mp4 流式下载取消函数
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

/**
 * mp4 直链流式下载（Range 断点续传：已有部分文件时从断点追加，416 视为已完成）
 */
async function downloadMp4(url, savePath, headers) {
  fs.mkdirSync(path.dirname(savePath), { recursive: true })

  let startByte = 0
  try {
    if (fs.existsSync(savePath)) startByte = fs.statSync(savePath).size
  } catch {
    /* ignore */
  }

  const reqHeaders = { ...headers }
  if (startByte > 0) reqHeaders['Range'] = `bytes=${startByte}-`

  const controller = new AbortController()
  currentCancel = () => controller.abort()

  const resp = await streamClient.get(url, {
    headers: reqHeaders,
    responseType: 'stream',
    timeout: 0,
    signal: controller.signal
  })

  // 已完整下载（Range 起点等于文件长度）
  if (resp.status === 416) {
    notifyProgress({ type: 'complete', outputPath: savePath })
    return savePath
  }
  if (resp.status !== 200 && resp.status !== 206) {
    throw new Error(`CDN 返回 HTTP ${resp.status}`)
  }

  const appended = resp.status === 206
  const contentLength = Number(resp.headers['content-length'] || 0)
  const total = contentLength + (appended ? startByte : 0)
  const out = fs.createWriteStream(savePath, { flags: appended ? 'a' : 'w' })

  let loaded = appended ? startByte : 0
  // 进度事件节流：按 chunk 触发会以千次/秒穿越 contextBridge，批量任务下渲染进程会被拖垮
  let lastEmit = 0
  let percent = 0
  resp.data.on('data', (chunk) => {
    loaded += chunk.length
    const now = Date.now()
    if (now - lastEmit < 300) return
    lastEmit = now
    percent = total ? Math.min(100, Math.floor((loaded / total) * 100)) : 0
    notifyProgress({
      type: 'mp4_progress',
      loaded,
      total,
      percent
    })
  })

  try {
    await new Promise((resolve, reject) => {
      out.on('finish', resolve)
      out.on('error', reject)
      resp.data.on('error', reject)
      resp.data.pipe(out)
    })
  } catch (e) {
    out.destroy()
    throw e
  }

  notifyProgress({ type: 'complete', outputPath: savePath })
  return savePath
}

/**
 * 下载视频：mp4 直链走流式下载，m3u8 走 HlsDownloader（分片并发 + ffmpeg 转封装）
 * @param {object} payload { videoUrl, format:'mp4'|'m3u8', quality, savePath, pageUrl }
 */
async function startDownload(payload) {
  const { videoUrl, format, quality, savePath, pageUrl } = payload || {}
  if (!videoUrl || !savePath) {
    return { success: false, error: '缺少必要参数（videoUrl / savePath）' }
  }

  try {
    const headers = await buildHeaders(pageUrl)

    if (format === 'mp4') {
      const outputPath = await downloadMp4(videoUrl, savePath, headers)
      return { success: true, outputPath }
    }

    currentDownloader = new HlsDownloader(videoUrl, headers, {
      concurrency: 8,
      timeout: 60000,
      tempDirPrefix: 'ph_',
      client: streamClient
    })
    const result = await currentDownloader.download(quality || 'best', savePath, notifyProgress)
    return { success: true, ...result }
  } catch (err) {
    console.error('[pornhub] 下载失败:', err?.message)
    return { success: false, error: err?.message || '下载失败' }
  } finally {
    currentDownloader = null
    currentCancel = null
  }
}

export default {
  getVideoInfo,
  getModelVideos,
  startDownload,
  cancelDownload: async () => {
    if (currentCancel) {
      currentCancel()
      return { success: true }
    }
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

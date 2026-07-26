/**
 * missav 演员作品查询 IPC 桥接
 * 复用 downloader/api.js 的 Api 实例发起请求（keep-alive 连接池、统一 UA）
 * 传输层参考 python 脚本的 fetch_with_mirrors()：镜像轮询 + Cloudflare 拦截判定 + sticky host
 */
import Api from './downloader/api.js'
import { ipcRenderer } from 'electron'

// MissAV 镜像白名单（参考 config.py MIRRORS['missav']）
const MIRRORS = ['missav.ws', 'missav.ai', 'missav123.com', 'missav.live']
const BASE_HOST = 'missav.ws'
const BASE = `https://${BASE_HOST}`

// sticky 命中的镜像 host，后续请求优先使用
let activeHost = null

const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})

const COMMON_HEADERS = {
  referer: BASE
}

function decode(text) {
  try {
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
      .replace(/&[a-z]+;/g, (m) => entities[m] ?? m)
      .trim()
  } catch {
    return text.trim()
  }
}

function toAbsolute(href) {
  if (!href) return ''
  if (href.startsWith('http')) return href
  return BASE + (href.startsWith('/') ? href : '/' + href)
}

/** 替换 URL 的 host（保留 scheme/path/query/fragment） */
function swapHost(url, host) {
  try {
    const u = new URL(url)
    u.host = host
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Cloudflare 拦截页判定（参考 _is_cf_interstitial）
 * - 状态码 403 / 429 / 503
 * - cf-mitigated 头含 challenge
 * - 响应体前 3000 字节含 just a moment / cf-browser-verification / cf_chl_
 */
function isCfInterstitial(resp) {
  const status = resp?.status ?? 0
  if ([403, 429, 503].includes(status)) return true
  const headers = resp?.headers || {}
  const mitigated = headers['cf-mitigated'] || ''
  if (/challenge/i.test(mitigated)) return true
  const body = typeof resp?.data === 'string' ? resp.data.slice(0, 3000) : ''
  if (/just a moment|cf-browser-verification|cf_chl_/.test(body)) return true
  return false
}

/** 读取某镜像 host 下的 cookie（cf_clearance 等） */
async function cookiesFor(host) {
  try {
    return await api.getCookies(`.${host}`)
  } catch {
    return ''
  }
}

/**
 * 镜像轮询请求（参考 fetch_with_mirrors）
 * @param {string} url 原始 URL（host 会被逐个替换）
 * @param {object} opts
 * @param {(resp)=>boolean} [opts.validate] 内容校验，返回 true 视为有效
 * @param {(host)=>object} [opts.headersFactory] 按 host 生成请求头
 * @param {number} [opts.timeout] 单次超时毫秒
 * @returns {Promise<object|null>} 命中的响应，全部失败返回 null
 */
async function fetchWithMirrors(url, { validate, headersFactory, timeout = 15000 } = {}) {
  const original = (() => {
    try {
      return new URL(url).host
    } catch {
      return ''
    }
  })()

  // 轮询顺序：sticky host -> 原始 host -> 其余镜像（去重、保序）
  const ordered = []
  const pushUnique = (h) => {
    if (h && MIRRORS.includes(h) && !ordered.includes(h)) ordered.push(h)
  }
  if (activeHost) pushUnique(activeHost)
  pushUnique(original)
  MIRRORS.forEach(pushUnique)
  if (!ordered.length) ordered.push(...MIRRORS)

  for (const host of ordered) {
    const targetUrl = swapHost(url, host)
    const baseHeaders = headersFactory ? headersFactory(host) || {} : {}
    const cookie = await cookiesFor(host)
    const headers = {
      ...COMMON_HEADERS,
      ...baseHeaders,
      ...(cookie ? { Cookie: cookie } : {})
    }

    // 单个 host 内对传输错误重试 1 次
    let resp = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        resp = await api.rawGet({ url: targetUrl, headers, timeout })
        break
      } catch (e) {
        if (attempt === 1) console.warn('[missav] transport error', host, e.message)
      }
    }
    if (!resp) continue

    if (isCfInterstitial(resp)) continue
    if (validate && !validate(resp)) continue

    // 命中成功，记为 sticky host
    activeHost = host
    return resp
  }
  return null
}

/**
 * 通用 HTML 拉取（带镜像轮询）。全部镜像被拦截/失败时抛出 'BLOCKED'。
 */
async function fetchHtml(url, opts = {}) {
  const resp = await fetchWithMirrors(url, {
    ...opts,
    validate:
      opts.validate || ((r) => r.status === 200 && typeof r.data === 'string' && r.data.length > 0)
  })
  if (!resp) {
    const err = new Error('BLOCKED')
    err.code = 'BLOCKED'
    throw err
  }
  return typeof resp.data === 'string' ? resp.data : String(resp.data)
}

/**
 * 获取演员排行榜列表
 */
async function getActresses() {
  const html = await fetchHtml(`${BASE}/actresses/ranking`)
  const list = []

  // 优先：单个演员卡片内同时包含 href(/actresses/slug) 与 h4 名字
  const cardRe =
    /<a[^>]+href="((?:https?:\/\/[^"]*?)?\/(?:[a-z]{2}\/)?actresses\/([^"?]+))"[^>]*>([\s\S]*?)<h4 class="text-nord13 truncate">([\s\S]*?)<\/h4>/g
  let m
  while ((m = cardRe.exec(html)) !== null) {
    const slug = decode(m[2])
    const name = decode(m[4].replace(/<[^>]+>/g, ''))
    const imgMatch = m[3].match(/<img[^>]+src="([^"]+)"/)
    list.push({ name: name || slug, slug, cover: imgMatch ? imgMatch[1] : '' })
  }

  // 回退：分别匹配 slug 与 名字
  if (list.length === 0) {
    const slugs = Array.from(
      html.matchAll(/href="\/(?:[a-z]{2}\/)?actresses\/([^"?/"]+)"/g),
      (x) => x[1]
    )
    const names = Array.from(
      html.matchAll(/<h4 class="text-nord13 truncate">([\s\S]*?)<\/h4>/g),
      (x) => decode(x[1].replace(/<[^>]+>/g, ''))
    )
    const count = Math.max(slugs.length, names.length)
    for (let i = 0; i < count; i++) {
      const slug = slugs[i] || names[i] || ''
      if (!slug) continue
      list.push({ name: names[i] || slug, slug, cover: '' })
    }
  }

  // 去重（按 slug）
  const seen = new Set()
  return list.filter((a) => {
    if (!a.slug || seen.has(a.slug)) return false
    seen.add(a.slug)
    return true
  })
}

// 从页面提取作品列表的HTML字符串
function extractWorksFromHTML(htmlString) {
  try {
    const parser = new DOMParser()
    const document = parser.parseFromString(htmlString, 'text/html')

    const works = Array.from(document.querySelectorAll('.thumbnail')).map((thumb) => {
      const link = thumb.querySelector('a[href]')
      const img = thumb.querySelector('img')
      const duration = thumb.querySelector('.absolute.bottom-1.right-1')
      const uncensored = thumb.querySelector('.absolute.bottom-1.left-1')

      return {
        dvdId: link?.getAttribute('alt')?.replaceAll('-uncensored-leak', '') || '',
        title: img?.getAttribute('alt') || '',
        coverUrl: img?.getAttribute('data-src') || img?.getAttribute('src') || '',
        duration: duration?.textContent?.trim() || '',
        isUncensored: !!uncensored,
        url: link?.getAttribute('href') || ''
      }
    })
    return works
  } catch (error) {
    console.log(error)
  }
}

/**
 * 获取某演员的作品列表（分页）
 */
async function getVideos(slug, page = 1, sort = 'views') {
  const url = `${BASE}/dm2/actresses/${decodeURIComponent(slug)}?sort=${sort}&page=${page}`
  const html = await fetchHtml(url)
  const list = extractWorksFromHTML(html)
  const hasNext = html.includes(`page=${page + 1}`)
  return {
    list,
    page,
    hasMore: list.length > 0 && hasNext
  }
}

function extractDownloadLinksFromHTML(htmlString) {
  const parser = new DOMParser()
  const document = parser.parseFromString(htmlString, 'text/html')
  const rows = document.querySelectorAll('table.min-w-full tbody tr')
  const results = []

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td')
    if (cells.length < 3) return

    const linkElement = cells[0].querySelector('a[rel="nofollow"]')
    const magnetLink = linkElement ? linkElement.getAttribute('href') : null

    const fileName = linkElement ? linkElement.textContent.trim() : ''
    const size = cells[1] ? cells[1].textContent.trim() : ''
    const date = cells[2] ? cells[2].textContent.trim() : ''
    const hdTag = cells[0].querySelector('.bg-primary')
    const isHd = hdTag !== null

    if (magnetLink && magnetLink.startsWith('magnet:')) {
      results.push({
        magnet: magnetLink,
        name: fileName,
        size: size,
        date: date,
        isHd: isHd
      })
    }
  })

  return results
}

/**
 * 获取单个视频的 BT 下载链接
 */
async function getVideoBTLinks(dvdId) {
  const html = await fetchHtml(`${BASE}/${dvdId}`)
  const list = extractDownloadLinksFromHTML(html)
  return list
}

/**
 * 检测是否已通过 Cloudflare 验证（存在 cf_clearance cookie）
 */
async function checkAccess() {
  for (const host of [activeHost, BASE_HOST, ...MIRRORS].filter(Boolean)) {
    const cookie = await cookiesFor(host)
    if (/(^|;\s*)cf_clearance=/.test(cookie)) return true
  }
  return false
}

/**
 * 手动触发一次访问，用于校验当前镜像是否可用（不抛错）
 */
async function ping() {
  const resp = await fetchWithMirrors(`${BASE}/`, {
    validate: (r) => r.status === 200
  })
  return !!resp
}

function unpack(obfuscatedCode) {
  let result
  const fakeEval = (code) => (result = code) // 劫持 eval，只接收不解密
  // 用 new Function 构造沙箱，屏蔽真实 eval
  new Function('eval', obfuscatedCode)(fakeEval)
  return result
}
/**
 * 从视频页 HTML 中提取 m3u8 播放地址（参考 SiteMissAV.get_url_infos）
 */
function findM3u8InHtml(htmlContent) {
  // 1. 找到 eval( 的位置
  const evalIndex = htmlContent.indexOf('eval(')
  if (evalIndex === -1) {
    console.error('未找到 eval(')
    return null
  }

  // 2. 从 eval( 开始，找到第一个换行符
  const start = evalIndex
  const end = htmlContent.indexOf('\n', start)

  if (end === -1) {
    console.error('无法找到换行符')
    return null
  }

  // 3. 提取这一行
  const line = htmlContent.substring(start, end)

  // 4. 使用eval执行这一行
  try {
    return parseToObject(unpack(line))
  } catch (error) {
    console.error('eval执行失败:', error.message)
    return null
  }
}
function parseToObject(str) {
  const obj = {}
  // 匹配 variable='value' 或 variable="value" 格式
  const regex = /(\w+)\s*=\s*['"]([^'"]+)['"]/g
  let match

  while ((match = regex.exec(str)) !== null) {
    obj[match[1]] = match[2]
  }

  return obj
}

/**
 * 将原始 source 映射转换为带清晰度标签的列表（自动在前，其余按分辨率降序）
 * 例：{ source, source842, source1280 } => [{label:'自动',...},{label:'1080P',...},{label:'720P',...}]
 */
function buildSources(raw) {
  if (!raw) return []
  const list = Object.entries(raw)
    .filter(([, v]) => typeof v === 'string' && /\.m3u8/i.test(v))
    .map(([key, url]) => {
      let label
      const pm = url.match(/(\d{3,4})p/i)
      if (pm) label = `${pm[1]}P`
      else if (/playlist\.m3u8/i.test(url) || key === 'source') label = '自动'
      else label = key.replace(/^source/i, '') || key
      return { key, url, label }
    })
  const rank = (x) => (x.label === '自动' ? 1e9 : parseInt(x.label, 10) || 0)
  list.sort((a, b) => rank(b) - rank(a))
  return list
}
/**
 * 解析视频页：标题、封面、m3u8 地址及所需的同源 Referer/Origin
 */
async function getVideoInfo(url) {
  const targetUrl = toAbsolute(url && url.startsWith('http') ? new URL(url).pathname : url)
  const resp = await fetchWithMirrors(targetUrl, {
    validate: (r) =>
      r.status === 200 &&
      typeof r.data === 'string' &&
      /og:title/.test(r.data) &&
      (/m3u8/.test(r.data) || /eval\(function/.test(r.data))
  })
  if (!resp) {
    const err = new Error('BLOCKED')
    err.code = 'BLOCKED'
    throw err
  }
  const html = typeof resp.data === 'string' ? resp.data : String(resp.data)

  const titleM = html.match(/og:title"\s+content="([^"]+)"/)
  const coverM = html.match(/og:image"\s+content="([^"]+)"/)
  const m3u8 = findM3u8InHtml(html)
  const sources = buildSources(m3u8)

  // 用于分片请求的同源凭证：以命中镜像作为 Referer/Origin
  const refererHost = activeHost || BASE_HOST
  const defaultUrl = sources[0]?.url || ''
  return {
    title: titleM ? decode(titleM[1]) : '',
    coverUrl: coverM ? coverM[1] : '',
    sources,
    m3u8Url: defaultUrl,
    referer: `https://${refererHost}/`,
    origin: `https://${refererHost}`,
    host: defaultUrl
      ? (() => {
          try {
            return new URL(defaultUrl).host
          } catch {
            return ''
          }
        })()
      : ''
  }
}

/**
 * 通知主进程为指定媒体 host 注入 Referer/Origin 与 CORS 响应头（供 hls.js 播放）
 */
function attachStreamHeaders(payload) {
  return ipcRenderer.invoke('missav:stream-attach', payload)
}

function detachStreamHeaders() {
  return ipcRenderer.invoke('missav:stream-detach')
}

const missav = {
  getActresses,
  getVideos,
  getVideoBTLinks,
  getVideoInfo,
  attachStreamHeaders,
  detachStreamHeaders,
  checkAccess,
  ping
}

export default missav

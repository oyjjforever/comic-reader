/**
 * 4khd 站点插件：抓取列表/详情页 HTML，解析图片原始地址并下载
 * 参考 missav.js（HTML 抓取 + 镜像轮询）与 yfantasy.js（二进制下载）
 * Node/axios 不执行 Service Worker，直接请求原始 HTML 即可拿到未改写的资源地址
 */
import Api from './api.js'
import fsp from 'fs/promises'
import file from '../file.ts'

// 入口与镜像域名：4khd.com 可能跳转到 *.uuss.uk 子域，轮询命中后 sticky
const MIRRORS = ['www.4khd.com', 'hecoq.uuss.uk']
let activeHost = MIRRORS[0]

const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})

function baseUrl() {
  return `https://${activeHost}`
}

function toAbsolute(href) {
  if (!href) return ''
  if (href.startsWith('http')) return href
  return baseUrl() + (href.startsWith('/') ? href : '/' + href)
}

function decode(text) {
  if (!text) return ''
  try {
    const el = document.createElement('textarea')
    el.innerHTML = String(text)
    return el.value.trim()
  } catch {
    return String(text).trim()
  }
}

/** Cloudflare 拦截页判定（参考 missav.isCfInterstitial） */
function isCfInterstitial(resp) {
  const status = resp?.status ?? 0
  if ([403, 429, 503].includes(status)) return true
  const mitigated = resp?.headers?.['cf-mitigated'] || ''
  if (/challenge/i.test(mitigated)) return true
  const body = typeof resp?.data === 'string' ? resp.data.slice(0, 3000) : ''
  if (/just a moment|cf-browser-verification|cf_chl_/.test(body)) return true
  return false
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

/**
 * 镜像轮询请求：sticky host 优先，命中有效响应后记住
 * @returns {Promise<object|null>} 命中的响应，全部失败返回 null
 */
async function fetchWithMirrors(url, { validate } = {}) {
  const ordered = []
  const pushUnique = (h) => {
    if (h && !ordered.includes(h)) ordered.push(h)
  }
  pushUnique(activeHost)
  MIRRORS.forEach(pushUnique)

  for (const host of ordered) {
    const targetUrl = url.startsWith('http') ? swapHost(url, host) : `https://${host}${url}`
    let resp = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        resp = await api.rawGet({
          url: targetUrl,
          headers: { Referer: `https://${host}/` },
          timeout: 20000
        })
        break
      } catch (e) {
        if (attempt === 1) console.warn('[4khd] transport error', host, e.message)
      }
    }
    if (!resp) continue
    if (isCfInterstitial(resp)) continue
    if (validate && !validate(resp)) continue
    activeHost = host
    return resp
  }
  return null
}

/** 通用 HTML 拉取，全部镜像失败时抛出 BLOCKED */
async function fetchHtml(url, validate) {
  const resp = await fetchWithMirrors(url, {
    validate: validate || ((r) => r.status === 200 && typeof r.data === 'string' && r.data.length > 0)
  })
  if (!resp) {
    const err = new Error('站点访问被拦截或不可用')
    err.code = 'BLOCKED'
    throw err
  }
  return typeof resp.data === 'string' ? resp.data : String(resp.data)
}

/**
 * 解析列表页 HTML，提取作品卡片
 * 实际结构：li.wp-block-post > a[href*="/content/"]（封面图）+ h2.wp-block-post-title（标题）
 * 注意：列表 img 无 alt 属性，标题必须从 h2.wp-block-post-title 取
 * @returns {Array<{href:string, thumb:string, title:string, date:string}>}
 */
function parseListHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const items = []
  const seen = new Set()
  doc.querySelectorAll('li.wp-block-post').forEach((li) => {
    const titleLink = li.querySelector('h2.wp-block-post-title a')
    const href = toAbsolute(
      titleLink?.getAttribute('href') ||
        li.querySelector('a[href*="/content/"]')?.getAttribute('href') ||
        ''
    )
    if (!href || seen.has(href)) return
    const img = li.querySelector('img.wp-post-image') || li.querySelector('img')
    const thumb = toAbsolute(
      img?.getAttribute('data-src') || img?.getAttribute('src') || ''
    )
    // 移动端/桌面端各有一个同名 h2，textContent 已自动解码实体
    const title = decode(titleLink?.textContent).replace(/\s+/g, ' ').trim()
    const date = li.querySelector('.wp-block-post-date time')?.getAttribute('datetime') || ''
    if (!thumb && !title) return
    seen.add(href)
    items.push({ href, thumb, title, date })
  })
  return items
}

/**
 * 获取作品列表（分页）
 * 分页格式为查询参数：/?query-3-page=2（见页码导航 href）
 * @param {number} page 页码，从 1 开始
 * @returns {Promise<{list:Array, hasMore:boolean, totalPages:number}>}
 */
async function fetchList(page = 1) {
  const path = page <= 1 ? '/' : `/?query-3-page=${page}`
  const html = await fetchHtml(path, (r) => r.status === 200 && /\/content\//.test(String(r.data)))
  const list = parseListHtml(html)
  // 总页数来自页码导航（1 2 3 … 3,224），列表页数远大于相册分页，放宽上限
  const totalPages = detectMaxPage(html, 1000000)
  const hasNext = list.length > 0 && page < totalPages
  return { list, page, hasMore: hasNext, totalPages }
}

/** 图片域名/路径特征（img.uuss.uk 及 /w1300-rw/ 之类的尺寸路径） */
const IMG_HOST_RE = /img\.(uuss\.uk|4khd\.com)|\/w\d{3,4}[-/]/
/** 排除的杂项图片：logo / 头像 / 图标 / 广告素材 */
const IMG_EXCLUDE_RE = /logo|avatar|icon|widget|\/library\//i
const IMG_EXT_RE = /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i
/** 懒加载属性依次尝试 */
const LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-echo', 'src']

/** 从 img 元素提取真实图片地址（含属性兜底扫描） */
function extractImgUrl(img) {
  for (const attr of LAZY_ATTRS) {
    const v = img.getAttribute(attr)
    if (v && !v.startsWith('data:') && !IMG_EXCLUDE_RE.test(v)) {
      return v
    }
  }
  for (const attr of img.attributes || []) {
    const v = attr.value || ''
    if (/^https?:\/\//.test(v) && IMG_EXT_RE.test(v) && !IMG_EXCLUDE_RE.test(v)) return v
  }
  return ''
}

function collectImages(root) {
  const images = []
  root.querySelectorAll('img').forEach((img) => {
    const src = extractImgUrl(img)
    if (!src) return
    if (IMG_HOST_RE.test(src) || (src.startsWith('http') && IMG_EXT_RE.test(src))) {
      images.push(toAbsolute(src))
    }
  })
  return images
}

/** 详情页标题候选：站点名/导航类标题视为无效 */
const BAD_TITLE_RE = /^4khd$/i

/**
 * 解析详情页 HTML，提取标题与图片原始地址
 * 标题以列表页传入的 fallback 为权威（与卡片显示/已下载判断一致），
 * 未传入时依次尝试：og:title > h1.entry-title > 非站点名 h1 > <title>
 * 优先在正文（article/entry-content/main）内解析，正文无图时回退整页扫描
 * @returns {{title:string, images:string[]}}
 */
function parseDetailHtml(html, fallbackTitle) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const clean = (t) => decode(t).replace(/\s+/g, ' ').trim()
  const candidates = [
    // <title> 只按「前后带空格的分隔符」切分，避免误伤标题内的连字符
    clean(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')),
    clean(doc.querySelector('h1.entry-title')?.textContent),
    // 页头 logo 常是 h1 包裹站点名，需排除
    [...doc.querySelectorAll('h1')].map((h) => clean(h.textContent)).find((t) => t && !BAD_TITLE_RE.test(t)),
    clean(doc.querySelector('title')?.textContent).split(/\s+[|–—-]\s+/)[0]
  ]
  const title =
    clean(fallbackTitle) ||
    candidates.find((t) => t && !BAD_TITLE_RE.test(t)) ||
    'untitled'

  return {
    title,
    images: [...new Set(parseImages(html))]
  }
}

/** 从单页 HTML 提取相册图片（正文优先，无图回退整页） */
function parseImages(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root =
    doc.querySelector('article') ||
    doc.querySelector('.entry-content') ||
    doc.querySelector('main') ||
    doc.body
  let images = collectImages(root)
  if (!images.length && root !== doc.body) {
    images = collectImages(doc.body)
  }
  return images
}

/** 探测页码导航总页数（page-numbers，如 1 2 3 … 3,224） */
function detectMaxPage(html, cap = 200) {
  let max = 1
  const re = /class="page-numbers[^"]*"[^>]*>\s*([\d.,，…]+)/g
  let m
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1].replace(/[.,，…]/g, ''), 10)
    // 上限保护，避免异常页码导致大量请求
    if (Number.isFinite(n) && n > max && n <= cap) max = n
  }
  return max
}

/**
 * 获取作品详情（仅第 1 页图片 + 相册总页数，供滚动增量加载）
 * 详情页相册按 /2 /3 … 后缀分页（每页约 30 张）
 * @param {string} url 详情页地址
 * @param {string} [fallbackTitle] 列表页标题，详情页标题解析失败时兜底
 * @returns {Promise<{url:string, title:string, images:string[], maxPage:number, pagesLoaded:number}>}
 */
async function fetchDetail(url, fallbackTitle) {
  const html = await fetchHtml(url)
  const base = parseDetailHtml(html, fallbackTitle)
  const maxPage = detectMaxPage(html)
  console.log('[4khd] detail page 1/' + maxPage + ':', base.title, 'images:', base.images.length)
  return { url, title: base.title, images: base.images, maxPage, pagesLoaded: 1 }
}

/**
 * 获取详情页相册指定分页的图片
 * @param {string} url 详情页地址
 * @param {number} page 页码，从 1 开始（1 即详情页本身）
 * @returns {Promise<{page:number, images:string[]}>}
 */
async function fetchDetailPage(url, page = 1) {
  const target = page <= 1 ? url : `${url}/${page}`
  const html = await fetchHtml(target)
  return { page, images: [...new Set(parseImages(html))] }
}

/**
 * 下载单张图片到本地
 * @param {string} url 图片地址
 * @param {string} savePath 完整保存路径（含文件名）
 */
async function downloadFile(url, savePath) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: `${baseUrl()}/` },
    timeout: 60000
  })
  const data = Buffer.from(res)
  file.ensureDir(savePath)
  await fsp.writeFile(savePath, data)
}

export default {
  fetchList,
  fetchDetail,
  fetchDetailPage,
  downloadFile,
  getActiveHost: () => activeHost
}

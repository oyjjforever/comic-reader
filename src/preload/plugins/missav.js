/**
 * missav 演员作品查询 IPC 桥接
 * 复用 downloader/api.js 的 Api 实例发起请求（keep-alive 连接池、重试、统一 UA）
 * 解析逻辑参考对应的 python 抓取脚本
 */
import Api from './downloader/api.js'

const BASE = 'https://missav.ws'

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

async function fetchHtml(url) {
  const data = await api.get({ url, headers: COMMON_HEADERS })
  return typeof data === 'string' ? data : String(data)
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
    // 方法1：使用DOMParser
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
  // 获取所有磁力链接的行
  const rows = document.querySelectorAll('table.min-w-full tbody tr')
  const results = []

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td')
    if (cells.length < 3) return

    // 提取磁力链接
    const linkElement = cells[0].querySelector('a[rel="nofollow"]')
    const magnetLink = linkElement ? linkElement.getAttribute('href') : null

    // 提取文件名
    const fileName = linkElement ? linkElement.textContent.trim() : ''

    // 提取文件大小
    const size = cells[1] ? cells[1].textContent.trim() : ''

    // 提取日期
    const date = cells[2] ? cells[2].textContent.trim() : ''

    // 检查是否有"高清"标签
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

const missav = {
  getActresses,
  getVideos,
  getVideoBTLinks
}

export default missav

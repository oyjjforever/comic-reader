/* eslint-disable no-console */
import axios from 'axios'
import http from 'http'
import https from 'https'

const DEFAULT_API_DOMAIN = 'www.wn07.ru'

// 全局 Keep-Alive 代理池，复用 TCP 连接，减少握手开销
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, keepAliveMsecs: 30000 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, keepAliveMsecs: 30000 })

/**
 * 文件名过滤，替换不合法的文件名字符
 * @param {string} s
 * @returns {string}
 */
function filenameFilter(s) {
  return s
    .replace(/[\\/]/g, ' ')
    .replace(/:/g, '：')
    .replace(/\*/g, '⭐')
    .replace(/\?/g, '？')
    .replace(/"/g, "'")
    .replace(/</g, '《')
    .replace(/>/g, '》')
    .replace(/\|/g, '丨')
    .trim()
}

/**
 * 构建 API 请求的 axios 实例
 * @param {object} config
 * @returns {import('axios').AxiosInstance}
 */
function buildAxios(config) {
  return axios.create({
    timeout: 10000,
    adapter: 'http',
    httpAgent,
    httpsAgent,
    proxy:
      config?.proxyMode === 'Custom'
        ? { protocol: 'http', host: config.proxyHost, port: config.proxyPort }
        : config?.proxyMode === 'NoProxy'
          ? false
          : undefined,
    validateStatus: () => true
  })
}

/**
 * 构建图片下载的 axios 实例
 * @param {object} config
 * @returns {import('axios').AxiosInstance}
 */
function buildImgAxios(config) {
  return axios.create({
    timeout: 30000,
    adapter: 'http',
    httpAgent,
    httpsAgent,
    proxy:
      config?.proxyMode === 'Custom'
        ? { protocol: 'http', host: config.proxyHost, port: config.proxyPort }
        : config?.proxyMode === 'NoProxy'
          ? false
          : undefined,
    validateStatus: () => true,
    responseType: 'arraybuffer'
  })
}

/**
 * 简单重试封装
 * @param {Function} fn
 * @param {object} options
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function withRetry(fn, { maxRetries = 3, delayMs = 1000 } = {}) {
  let lastErr
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const resp = await fn()
      if (resp.status !== 200) throw new Error(`${resp.status} ${resp.statusText}`)
      return resp
    } catch (e) {
      lastErr = e
      if (i === maxRetries) break
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

// ===================== HTML 解析工具函数 =====================

/**
 * 从搜索结果 HTML 中解析漫画列表
 * @param {string} html
 * @param {boolean} isSearchByTag
 * @returns {object} SearchResult
 */
function parseSearchResult(html, isSearchByTag) {
  const comics = []

  // 匹配所有 .li.gallary_item 元素
  const liRegex = /<li[^>]*class="[^"]*li\s*gallary_item[^"]*"[^>]*>([\s\S]*?)<\/li>/g
  let liMatch
  while ((liMatch = liRegex.exec(html)) !== null) {
    const liContent = liMatch[1]

    // 提取标题和ID: .title > a 的 href 和 title
    const titleAMatch = liContent.match(
      /<div[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*href="\/photos-index-aid-(\d+)\.html"[^>]*title="([^"]*)"[^>]*>/
    )
    if (!titleAMatch) continue

    const id = parseInt(titleAMatch[1], 10)
    const titleHtml = titleAMatch[2]

    // 提取纯文本标题
    const titleTextMatch = liContent.match(
      /<div[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/
    )
    const title = titleTextMatch ? filenameFilter(titleTextMatch[1].trim()) : filenameFilter(titleHtml)

    // 提取封面
    const imgMatch = liContent.match(/<img[^>]*src="([^"]*)"[^>]*>/)
    const cover = imgMatch ? `https:${imgMatch[1]}` : ''

    // 提取额外信息
    const infoMatch = liContent.match(/<div[^>]*class="[^"]*info_col[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    const additionalInfo = infoMatch ? infoMatch[1].trim() : ''

    comics.push({
      id,
      titleHtml,
      title,
      cover,
      additionalInfo,
      isDownloaded: false
    })
  }

  // 提取当前页码
  let currentPage = 1
  const currentPageMatch = html.match(/<span[^>]*class="[^"]*thispage[^"]*"[^>]*>(\d+)<\/span>/)
  if (currentPageMatch) {
    currentPage = parseInt(currentPageMatch[1], 10)
  }

  // 提取总页数
  let totalPage = 1
  if (isSearchByTag) {
    // 从分页器最后一个链接获取
    const paginatorLinks = [
      ...html.matchAll(/<div[^>]*class="[^"]*f_left\s*paginator[^"]*"[^>]*>[\s\S]*?<a[^>]*>(\d+)<\/a>/g)
    ]
    if (paginatorLinks.length > 0) {
      totalPage = Math.max(parseInt(paginatorLinks[paginatorLinks.length - 1][1], 10), currentPage)
    }
  } else {
    // 从总结果数计算
    const totalMatch = html.match(/<div[^>]*id="bodywrap"[^>]*>[\s\S]*?class="[^"]*result[^"]*"[^>]*><b>([\d,]+)<\/b>/)
    if (totalMatch) {
      const total = parseInt(totalMatch[1].replace(/,/g, ''), 10)
      const pageSize = 24
      totalPage = Math.ceil(total / pageSize)
    }
  }

  return {
    comics,
    currentPage,
    totalPage,
    isSearchByTag
  }
}

/**
 * 从漫画详情 HTML 中解析漫画信息
 * @param {string} html
 * @param {Array} imgList
 * @returns {object} Comic
 */
function parseComic(html, imgList) {
  // 提取漫画ID: head > link 的 href
  const linkMatch = html.match(/<link[^>]*href="\/feed-index-aid-(\d+)\.html"[^>]*\/?>/)
  const id = linkMatch ? parseInt(linkMatch[1], 10) : 0

  // 提取标题: #bodywrap > h2
  const h2Match = html.match(/<div[^>]*id="bodywrap"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/)
  const title = h2Match ? filenameFilter(h2Match[1].trim()) : ''

  // 提取封面: .asTBcell.uwthumb > img 的 src
  const coverMatch = html.match(
    /<div[^>]*class="[^"]*asTBcell\s*uwthumb[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>/
  )
  const coverSrc = coverMatch ? coverMatch[1].replace(/^\//, '') : ''
  const cover = coverSrc ? `https://${coverSrc}` : ''

  // 提取分类和页数: .asTBcell.uwconn > label
  const labelRegex = /<div[^>]*class="[^"]*asTBcell\s*uwconn[^"]*"[^>]*>([\s\S]*?)<\/div>/g
  let category = ''
  let imageCount = 0
  let labelContent
  while ((labelContent = labelRegex.exec(html)) !== null) {
    const labels = labelContent[1].match(/<label[^>]*>([\s\S]*?)<\/label>/g)
    if (labels) {
      for (const label of labels) {
        const text = label.replace(/<[^>]*>/g, '').trim()
        if (text.startsWith('分類：')) {
          category = text.replace('分類：', '')
        }
        if (text.startsWith('頁數：')) {
          const countStr = text.replace('頁數：', '').replace('P', '')
          imageCount = parseInt(countStr, 10) || 0
        }
      }
    }
  }

  // 提取标签: .tagshow
  const tags = []
  const tagRegex = /<a[^>]*class="[^"]*tagshow[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  let tagMatch
  while ((tagMatch = tagRegex.exec(html)) !== null) {
    const name = tagMatch[2].trim()
    const url = tagMatch[1]
    if (name) {
      tags.push({ name, url })
    }
  }

  // 提取简介: .asTBcell.uwconn > p
  const introMatch = html.match(
    /<div[^>]*class="[^"]*asTBcell\s*uwconn[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/
  )
  const intro = introMatch ? introMatch[1] : ''

  return {
    id,
    title,
    cover,
    category,
    imageCount,
    tags,
    intro,
    isDownloaded: false,
    imgList
  }
}

/**
 * 从用户信息 HTML 中解析用户资料
 * @param {string} html
 * @param {string} apiDomain
 * @returns {object} UserProfile
 */
function parseUserProfile(html, apiDomain) {
  // 检查是否登录：如果有 .title.title_c 则未登录
  if (/<[^>]*class="[^"]*title\s*title_c[^"]*"/.test(html)) {
    throw new Error('未登录，cookie已过期或cookie无效')
  }

  // 获取头像与用户名的 <a>
  const aMatch = html.match(
    /<a[^>]*class="[^"]*top_utab\s*ui[^"]*"[^>]*>([\s\S]*?)<\/a>/
  )
  if (!aMatch) {
    throw new Error('没有找到头像与用户名的<a>')
  }
  const aContent = aMatch[1]

  // 获取头像
  const imgMatch = aContent.match(/<img[^>]*src="([^"]*)"[^>]*>/)
  let avatar
  if (imgMatch) {
    avatar = `https://${apiDomain}/${imgMatch[1]}`
  } else {
    avatar = `https://${apiDomain}/userpic/nopic.png`
  }

  // 获取用户名
  const text = aContent.replace(/<[^>]*>/g, '').trim()

  return {
    username: text,
    avatar
  }
}

/**
 * 从书架 HTML 中解析书架信息
 * @param {string} html
 * @returns {object} GetShelfResult
 */
function parseShelfResult(html) {
  const comics = []

  // 匹配所有 .asTB 元素
  const divRegex = /<div[^>]*class="[^"]*asTB[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g
  let divMatch
  while ((divMatch = divRegex.exec(html)) !== null) {
    const divContent = divMatch[1]

    // 提取ID和标题: .l_title > a
    const titleAMatch = divContent.match(
      /<div[^>]*class="[^"]*l_title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="\/photos-index-aid-(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/
    )
    if (!titleAMatch) continue

    const id = parseInt(titleAMatch[1], 10)
    const title = filenameFilter(titleAMatch[2].trim())

    // 提取封面: .asTBcell.thumb img
    const coverMatch = divContent.match(
      /<div[^>]*class="[^"]*asTBcell\s*thumb[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>/
    )
    const cover = coverMatch ? `https:${coverMatch[1]}` : ''

    // 提取收藏时间: .l_catg > span
    const timeMatch = divContent.match(
      /<div[^>]*class="[^"]*l_catg[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
    )
    let favoriteTime = ''
    if (timeMatch) {
      const timeText = timeMatch[1].trim()
      if (timeText.startsWith('創建時間：')) {
        favoriteTime = timeText.replace('創建時間：', '').trim()
      }
    }

    // 提取书架: .l_catg > a
    const shelfAMatch = divContent.match(
      /<div[^>]*class="[^"]*l_catg[^"]*"[^>]*>[\s\S]*?<a[^>]*href="\/users-users_fav-c-(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/
    )
    const shelf = shelfAMatch
      ? { id: parseInt(shelfAMatch[1], 10), name: shelfAMatch[2].trim() }
      : { id: 0, name: '' }

    comics.push({
      id,
      title,
      cover,
      favoriteTime,
      shelf,
      isDownloaded: false
    })
  }

  // 提取当前页码
  let currentPage = 1
  const currentPageMatch = html.match(/<span[^>]*class="[^"]*thispage[^"]*"[^>]*>(\d+)<\/span>/)
  if (currentPageMatch) {
    currentPage = parseInt(currentPageMatch[1], 10)
  }

  // 提取总页数
  let totalPage = 1
  const paginatorLinks = [
    ...html.matchAll(/<div[^>]*class="[^"]*f_left\s*paginator[^"]*"[^>]*>[\s\S]*?<a[^>]*>(\d+)<\/a>/g)
  ]
  if (paginatorLinks.length > 0) {
    totalPage = Math.max(parseInt(paginatorLinks[paginatorLinks.length - 1][1], 10), currentPage)
  }

  // 提取当前书架: .cur
  const curShelfMatch = html.match(/<a[^>]*class="[^"]*cur[^"]*"[^>]*href="\/users-users_fav-c-(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/)
  const shelf = curShelfMatch
    ? { id: parseInt(curShelfMatch[1], 10), name: curShelfMatch[2].trim() }
    : { id: 0, name: '' }

  // 提取所有书架: .nav_list > a
  const shelves = []
  const shelfLinks = [
    ...html.matchAll(/<div[^>]*class="[^"]*nav_list[^"]*"[^>]*>([\s\S]*?)<\/div>/g)
  ]
  for (const shelfBlock of shelfLinks) {
    const linkRegex = /<a[^>]*href="\/users-users_fav-c-(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/g
    let linkMatch
    while ((linkMatch = linkRegex.exec(shelfBlock[1])) !== null) {
      shelves.push({ id: parseInt(linkMatch[1], 10), name: linkMatch[2].trim() })
    }
  }

  return {
    comics,
    currentPage,
    totalPage,
    shelf,
    shelves
  }
}

class WnacgClient {
  /**
   * @param {object} appConfig
   * appConfig = { proxyMode: 'System'|'NoProxy'|'Custom', proxyHost?: string, proxyPort?: number, apiDomain?: string, cookie?: string }
   */
  constructor(appConfig = {}) {
    this.appConfig = appConfig
    this.api = buildAxios(appConfig)
    this.img = buildImgAxios(appConfig)
    this.cover = buildAxios(appConfig)
  }

  /**
   * 获取 API 域名
   * @returns {string}
   */
  getApiDomain() {
    return this.appConfig.apiDomain || DEFAULT_API_DOMAIN
  }

  /**
   * 重新加载 HTTP 客户端
   */
  reloadClient() {
    this.api = buildAxios(this.appConfig)
    this.img = buildImgAxios(this.appConfig)
    this.cover = buildAxios(this.appConfig)
  }

  /**
   * 登录
   * @param {string} username
   * @param {string} password
   * @returns {Promise<string>} cookie 字符串
   */
  async login(username, password) {
    const apiDomain = this.getApiDomain()
    const resp = await this.api.post(
      `https://${apiDomain}/users-check_login.html`,
      new URLSearchParams({ login_name: username, login_pass: password }),
      {
        headers: { referer: `https://${apiDomain}/` }
      }
    )

    if (resp.status !== 200) {
      throw new Error(`预料之外的状态码(${resp.status}): ${typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)}`)
    }

    let loginResp
    try {
      loginResp = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
    } catch (_) {
      throw new Error(`将body解析为LoginResp失败: ${resp.data}`)
    }

    if (!loginResp.ret) {
      throw new Error(`登录失败: ${JSON.stringify(loginResp)}`)
    }

    const cookie = resp.headers['set-cookie']
    if (!cookie) {
      throw new Error(`响应中没有set-cookie字段: ${JSON.stringify(loginResp)}`)
    }

    return cookie
  }

  /**
   * 获取用户信息
   * @returns {Promise<object>} UserProfile
   */
  async getUserProfile() {
    const apiDomain = this.getApiDomain()
    const cookie = this.appConfig.cookie || ''

    const resp = await withRetry(() =>
      this.api.get(`https://${apiDomain}/users.html`, {
        headers: {
          cookie,
          referer: `https://${apiDomain}/`
        }
      })
    )

    if (resp.status !== 200) {
      throw new Error(`预料之外的状态码(${resp.status}): ${typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)}`)
    }

    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    return parseUserProfile(body, apiDomain)
  }

  /**
   * 按关键词搜索
   * @param {string} keyword
   * @param {number} pageNum
   * @returns {Promise<object>} SearchResult
   */
  async searchByKeyword(keyword, pageNum) {
    const apiDomain = this.getApiDomain()
    const resp = await withRetry(() =>
      this.api.get(`https://${apiDomain}/search/index.php`, {
        params: {
          q: keyword,
          syn: 'yes',
          f: '_all',
          s: 'create_time_DESC',
          p: pageNum
        },
        headers: {
          referer: `https://${apiDomain}/`
        }
      })
    )

    if (resp.status !== 200) {
      throw new Error(`预料之外的状态码(${resp.status}): ${typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)}`)
    }

    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    return parseSearchResult(body, false)
  }

  /**
   * 按标签搜索
   * @param {string} tagName
   * @param {number} pageNum
   * @returns {Promise<object>} SearchResult
   */
  async searchByTag(tagName, pageNum) {
    const apiDomain = this.getApiDomain()
    const url = `https://${apiDomain}/albums-index-page-${pageNum}-tag-${tagName}.html`

    const resp = await withRetry(() =>
      this.api.get(url, {
        headers: {
          referer: `https://${apiDomain}/`
        }
      })
    )

    if (resp.status !== 200) {
      throw new Error(`预料之外的状态码(${resp.status}): ${typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)}`)
    }

    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    return parseSearchResult(body, true)
  }

  /**
   * 获取图片列表
   * @param {number} id
   * @returns {Promise<Array>} ImgList
   */
  async getImgList(id) {
    const apiDomain = this.getApiDomain()
    const url = `https://${apiDomain}/photos-gallery-aid-${id}.html`

    const resp = await withRetry(() =>
      this.api.get(url, {
        headers: {
          referer: `https://${apiDomain}/`
        }
      })
    )

    if (resp.status !== 200) {
      throw new Error(`预料之外的状态码(${resp.status}): ${typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)}`)
    }

    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)

    // 找到包含 `imglist` 的行
    const lines = body.split('\n')
    const imgListLine = lines.find((line) => line.includes('var imglist = '))
    if (!imgListLine) {
      throw new Error('没有找到包含`imglist`的行')
    }

    // 提取 JSON 部分
    const start = imgListLine.indexOf('[')
    const end = imgListLine.lastIndexOf(']')
    if (start === -1 || end === -1) {
      throw new Error('没有在`imglist`行中找到`[`或`]`')
    }

    // 将 JSON 部分转为合法的 JSON 字符串
    const jsonStr = imgListLine
      .substring(start, end + 1)
      .replace(/url:/g, '"url":')
      .replace(/caption:/g, '"caption":')
      .replace(/fast_img_host\+/g, '')
      .replace(/\\"/g, '"')

    let imgList
    try {
      imgList = JSON.parse(jsonStr)
    } catch (_) {
      throw new Error(`将JSON字符串解析为ImgList失败: ${jsonStr}`)
    }

    return imgList
  }

  /**
   * 获取漫画详情
   * @param {number} id
   * @returns {Promise<object>} Comic
   */
  async getComic(id) {
    const apiDomain = this.getApiDomain()

    const resp = await withRetry(() =>
      this.api.get(`https://${apiDomain}/photos-index-aid-${id}.html`, {
        headers: {
          referer: `https://${apiDomain}/`
        }
      })
    )

    if (resp.status !== 200) {
      throw new Error(`预料之外的状态码(${resp.status}): ${typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)}`)
    }

    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    // 并发获取图片列表
    const imgList = await this.getImgList(id)

    return parseComic(body, imgList)
  }

  /**
   * 获取书架
   * @param {number} shelfId
   * @param {number} pageNum
   * @returns {Promise<object>} GetShelfResult
   */
  async getShelf(shelfId, pageNum) {
    const apiDomain = this.getApiDomain()
    const cookie = this.appConfig.cookie || ''
    const url = `https://${apiDomain}/users-users_fav-page-${pageNum}-c-${shelfId}.html`

    const resp = await withRetry(() =>
      this.api.get(url, {
        headers: {
          cookie,
          referer: `https://${apiDomain}/`
        }
      })
    )

    if (resp.status !== 200) {
      throw new Error(`预料之外的状态码(${resp.status}): ${typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)}`)
    }

    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    return parseShelfResult(body)
  }

  /**
   * 获取图片数据和格式
   * @param {string} url
   * @returns {Promise<[Buffer, string]>} [imageData, format]
   */
  async getImgDataAndFormat(url) {
    const apiDomain = this.getApiDomain()

    let resp = await withRetry(() =>
      this.img.get(url, {
        headers: {
          referer: `https://${apiDomain}/`
        }
      })
    )

    if (resp.status === 429) {
      throw new Error('IP被封，请在配置中减少并发数或设置下载完成后的休息时间，以此降低下载速度，稍后再试')
    }

    if (resp.status !== 200) {
      const text = Buffer.from(resp.data || '').toString('utf8')
      throw new Error(`预料之外的状态码(${resp.status}): ${text}`)
    }

    let buf = Buffer.from(resp.data)

    // 如果数据为空，加时间戳重试
    if (!buf || buf.length === 0) {
      const ts = Math.floor(Date.now() / 1000)
      resp = await withRetry(() =>
        this.img.get(url, {
          params: { ts },
          headers: {
            referer: `https://${apiDomain}/`
          }
        })
      )
      if (resp.status !== 200) {
        const text = Buffer.from(resp.data || '').toString('utf8')
        throw new Error(`预料之外的状态码(${resp.status}): ${text}`)
      }
      buf = Buffer.from(resp.data)
    }

    // 从 URL 或数据中猜测图片格式
    const contentType = resp.headers['content-type']
    let format = 'jpeg'
    if (contentType) {
      if (contentType.includes('webp')) format = 'webp'
      else if (contentType.includes('png')) format = 'png'
      else if (contentType.includes('gif')) format = 'gif'
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) format = 'jpeg'
    } else {
      // 从 URL 扩展名猜测
      const extMatch = url.match(/\.(jpg|jpeg|png|gif|webp|bmp)/i)
      if (extMatch) {
        format = extMatch[1].toLowerCase()
        if (format === 'jpg') format = 'jpeg'
      }
    }

    return [buf, format]
  }

  /**
   * 获取封面数据
   * @param {string} coverUrl
   * @returns {Promise<Buffer>}
   */
  async getCoverData(coverUrl) {
    const apiDomain = this.getApiDomain()

    const resp = await this.cover.get(coverUrl, {
      headers: {
        referer: `https://${apiDomain}/`
      },
      responseType: 'arraybuffer'
    })

    if (resp.status !== 200) {
      const text = Buffer.from(resp.data || '').toString('utf8')
      throw new Error(`预料之外的状态码(${resp.status}): ${text}`)
    }

    return Buffer.from(resp.data)
  }
}

export { WnacgClient, DEFAULT_API_DOMAIN, filenameFilter, parseSearchResult, parseComic, parseUserProfile, parseShelfResult }

/* eslint-disable no-console */
import axios from 'axios'
import crypto from 'crypto'
import fsp from 'fs/promises'
import fs from 'fs'
import sharp from 'sharp'
import path from 'path'
const IMAGE_DOMAIN = 'cdn-msp2.jmapiproxy2.cc'
const API_DOMAIN = 'www.cdnblackmyth.club'

const APP_TOKEN_SECRET = '18comicAPP'
const APP_TOKEN_SECRET_2 = '18comicAPPContent'
const APP_DATA_SECRET = '185Hcomic3PAPP7R'
const APP_VERSION = '1.7.5'

const ApiPath = {
  Login: '/login',
  GetUserProfile: '/login',
  Search: '/search',
  GetComic: '/album',
  GetChapter: '/chapter',
  GetScrambleId: '/chapter_view_template',
  GetFavoriteFolder: '/favorite',
  GetWeeklyInfo: '/week',
  GetWeekly: '/week/filter'
}
const ensuredDirs = new Set()
function ensureDir(dirPath) {
  if (ensuredDirs.has(dirPath)) return
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  ensuredDirs.add(dirPath)
}
function md5_hex(s) {
  return crypto.createHash('md5').update(s).digest('hex')
}

function decrypt_data(ts, dataBase64) {
  // 注意：密钥为 md5_hex(ts + APP_DATA_SECRET) 的 UTF-8 字节（长度32）
  const keyStr = md5_hex(String(ts) + APP_DATA_SECRET)
  const key = Buffer.from(keyStr, 'utf8') // 32 bytes (hex string chars), matches Rust approach

  const encrypted = Buffer.from(dataBase64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-ecb', key, null)
  decipher.setAutoPadding(true) // PKCS#7
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

function buildAxios(config) {
  const instance = axios.create({
    baseURL: `https://${API_DOMAIN}`,
    // 超时可根据需要调整
    timeout: 10000,
    // 代理
    proxy:
      config?.proxyMode === 'Custom'
        ? {
            protocol: 'http',
            host: config.proxyHost,
            port: config.proxyPort
          }
        : config?.proxyMode === 'NoProxy'
          ? false
          : undefined, // System/默认
    validateStatus: () => true // 手动处理状态码
  })
  return instance
}

function buildImgAxios(config) {
  const instance = axios.create({
    // img 请求直接使用绝对 URL，无需 baseURL
    timeout: 10000,
    proxy:
      config?.proxyMode === 'Custom'
        ? {
            protocol: 'http',
            host: config.proxyHost,
            port: config.proxyPort
          }
        : config?.proxyMode === 'NoProxy'
          ? false
          : undefined,
    validateStatus: () => true,
    responseType: 'arraybuffer'
  })
  return instance
}

// 简单重试封装：最多 totalMs 时间窗口内每秒重试一次（或固定重试次数）
async function withRetry(fn, { maxRetries = 2, delayMs = 1000 } = {}) {
  let lastErr
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i === maxRetries) break
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

class JmClient {
  /**
   * @param {object} appConfig 可选：用于代理设置
   * appConfig = { proxyMode: 'System'|'NoProxy'|'Custom', proxyHost?: string, proxyPort?: number }
   */
  constructor(appConfig = {}) {
    this.api = buildAxios(appConfig)
    this.img = buildImgAxios(appConfig)
  }

  // 内部：通用请求，自动加 token 与 tokenparam
  async jm_request(method, path, query, form, ts) {
    const tokenparam = `${ts},${APP_VERSION}`
    const token =
      path === ApiPath.GetScrambleId
        ? md5_hex(`${ts}${APP_TOKEN_SECRET_2}`)
        : md5_hex(`${ts}${APP_TOKEN_SECRET}`)
    let formData
    if (form) {
      formData = new FormData()
      Object.keys(form).forEach((key) => {
        formData.append(key, form[key])
      })
    }
    const req = {
      method,
      url: path,
      headers: {
        token,
        tokenparam,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      },
      params: query || undefined,
      data: formData || undefined
    }

    return withRetry(async () => {
      try {
        const resp = await this.api.request(req)
        return resp
      } catch (e) {
        // 模拟 Rust 中的 is_timeout 提示
        if (e.code === 'ECONNABORTED') {
          const err = new Error('连接超时，请使用代理或换条线路重试')
          err.cause = e
          throw err
        }
        throw e
      }
    })
  }

  jm_get(path, query, ts) {
    return this.jm_request('GET', path, query, null, ts)
  }

  jm_post(path, query, payload, ts) {
    return this.jm_request('POST', path, query, payload, ts)
  }

  // Resp 解包、校验、解密与解析工具
  static ensureStatusOK(resp, errPrefix) {
    if (resp.status !== 200) {
      const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
      throw new Error(`${errPrefix}，预料之外的状态码(${resp.status}): ${body}`)
    }
  }

  static parseJmRespText(resp, errPrefix) {
    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    let jmResp
    try {
      jmResp = JSON.parse(body)
    } catch (_) {
      throw new Error(`${errPrefix}，将body解析为JmResp失败: ${body}`)
    }
    if (jmResp.code !== 200) {
      throw new Error(`${errPrefix}，预料之外的code: ${JSON.stringify(jmResp)}`)
    }
    if (typeof jmResp.data !== 'string') {
      throw new Error(`${errPrefix}，data字段不是字符串: ${JSON.stringify(jmResp)}`)
    }
    return jmResp.data
  }

  async login(username, password) {
    const ts = Math.floor(Date.now() / 1000)
    const form = { username, password }
    const httpResp = await this.jm_post(ApiPath.Login, null, form, ts)
    JmClient.ensureStatusOK(httpResp, '使用账号密码登录失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '使用账号密码登录失败')
    const data = decrypt_data(ts, dataEnc)

    const user = JSON.parse(data)
    user.photo = `https://${IMAGE_DOMAIN}/media/users/${user.photo}`
    return user
  }

  async get_user_profile() {
    const ts = Math.floor(Date.now() / 1000)
    const httpResp = await this.jm_post(ApiPath.GetUserProfile, null, null, ts)

    if (httpResp.status === 401) {
      throw new Error('获取用户信息失败，Cookie无效或已过期，请重新登录')
    }
    JmClient.ensureStatusOK(httpResp, '获取用户信息失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '获取用户信息失败')
    const data = decrypt_data(ts, dataEnc)

    const profile = JSON.parse(data)
    profile.photo = `https://${IMAGE_DOMAIN}/media/users/${profile.photo}`
    return profile
  }

  async search(keyword, page, sort, main_tag = 0) {
    const ts = Math.floor(Date.now() / 1000)
    const query = {
      main_tag,
      search_query: keyword,
      page,
      o: sort?.as_str ? sort.as_str() : sort
    }

    const httpResp = await this.jm_get(ApiPath.Search, query, ts)
    JmClient.ensureStatusOK(httpResp, '搜索失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '搜索失败')
    const data = decrypt_data(ts, dataEnc)

    // 可能是 RedirectRespData 或 SearchRespData
    try {
      const redirect = JSON.parse(data)
      if (redirect && redirect.redirect_aid) {
        const comic = await this.get_comic(parseInt(redirect.redirect_aid, 10))
        return { type: 'ComicRespData', data: comic }
      }
    } catch (_) {
      // ignore
    }
    try {
      const searchRespData = JSON.parse(data)
      return { type: 'SearchRespData', data: searchRespData }
    } catch (_) {
      throw new Error(`将解密后的数据解析为SearchRespData或RedirectRespData失败: ${data}`)
    }
  }

  async get_comic(aid) {
    const ts = Math.floor(Date.now() / 1000)
    const query = { id: aid }
    const httpResp = await this.jm_get(ApiPath.GetComic, query, ts)
    JmClient.ensureStatusOK(httpResp, '获取漫画失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '获取漫画失败')
    const data = decrypt_data(ts, dataEnc)
    return JSON.parse(data)
  }

  async get_chapter(id) {
    const ts = Math.floor(Date.now() / 1000)
    const query = { id }
    const httpResp = await this.jm_get(ApiPath.GetChapter, query, ts)
    JmClient.ensureStatusOK(httpResp, '获取章节失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '获取章节失败')
    const data = decrypt_data(ts, dataEnc)
    return JSON.parse(data)
  }
  from_comic_resp_data(comicResp) {
    // 生成章节信息
    const chapter_infos = []
    if (Array.isArray(comicResp.series) && comicResp.series.length > 0) {
      comicResp.series.forEach((s, index) => {
        const chapter_id = parseInt(s.id, 10)
        if (Number.isNaN(chapter_id)) return
        const order = index + 1
        let chapter_title = `第${order}话`
        if (s.name && String(s.name).length > 0) {
          chapter_title += ` ${s.name}`
        }
        chapter_infos.push({
          chapter_id,
          chapter_title,
          order,
          is_downloaded: null,
          chapter_download_dir: null
        })
      })
    } else {
      // 没有 series 时默认生成一个章节
      chapter_infos.push({
        chapter_id: comicResp.id,
        chapter_title: '第1话',
        order: 1,
        is_downloaded: null,
        chapter_download_dir: null
      })
    }

    const comic = {
      id: comicResp.id,
      name: comicResp.name,
      addtime: comicResp.addtime,
      description: comicResp.description,
      total_views: comicResp.total_views,
      likes: comicResp.likes,
      chapter_infos,
      series_id: comicResp.series_id,
      comment_total: comicResp.comment_total,
      author: comicResp.author,
      tags: comicResp.tags,
      works: comicResp.works,
      actors: comicResp.actors,
      related_list: comicResp.related_list,
      liked: comicResp.liked,
      is_favorite: comicResp.is_favorite,
      is_aids: comicResp.is_aids,
      is_downloaded: null,
      comic_download_dir: null
    }
    return comic
  }
  get_urls_with_block_num(chapter_id, scramble_id, chapter_data) {
    const urls_with_block_num = chapter_data.images
      .map((filename) => {
        const ext = path.extname(filename).slice(1).toLowerCase()
        const url = `https://${IMAGE_DOMAIN}/media/photos/${chapter_id}/${filename}`
        if (ext === 'gif') {
          return [url, 0]
        }
        if (ext !== 'webp') {
          return null
        }
        const filename_without_ext = path.basename(filename, path.extname(filename))
        const block_num = this.calculate_block_num(scramble_id, chapter_id, filename_without_ext)
        return [url, block_num]
      })
      .filter(Boolean)
    return urls_with_block_num
  }
  calculate_block_num(scramble_id, id, filename) {
    if (id < scramble_id) return 0
    if (id < 268_850) return 10

    const x = id < 421_926 ? 10 : 8
    const s = md5_hex(`${id}${filename}`)
    let block_num = s.charCodeAt(s.length - 1)
    block_num %= x
    block_num = block_num * 2 + 2
    return block_num
  }
  /**
   * 保存图片（含分块拼接与格式转换）
   * @param {string} savePath - 目标保存路径
   * @param {'jpeg'|'png'|'webp'} downloadFormat - 目标下载格式
   * @param {number} blockNum - 分块数量，0 表示无需拼接
   * @param {Buffer} srcImgData - 源图片二进制数据
   * @param {'gif'|'jpeg'|'png'|'webp'} srcFormat - 源图片格式
   */
  async saveImg(savePath, downloadFormat, blockNum, srcImgData, srcFormat) {
    const folderPath = path.dirname(savePath)
    ensureDir(folderPath)
    // 优化：webp->webp 且无需拼接，直接保存
    if (srcFormat === 'webp' && downloadFormat === 'webp' && blockNum === 0) {
      await fsp.writeFile(savePath, srcImgData)
      return
    }

    // GIF 直接保存
    if (srcFormat === 'gif') {
      await fsp.writeFile(savePath, srcImgData)
      return
    }

    const encoded = await decodeImage(downloadFormat, blockNum, srcImgData)
    await fsp.writeFile(savePath, encoded)
  }

  async decodeImage(downloadFormat, blockNum, srcImgData) {
    // 解码到原始 RGB
    const srcSharp = sharp(srcImgData, { failOn: 'none' }).removeAlpha()
    const { data: rgbData, info } = await srcSharp.raw().toBuffer({ resolveWithObject: true }) // rgbData: Buffer, info: { width, height, channels }

    const { width, height, channels } = info
    if (channels !== 3) {
      // 保障为 RGB 三通道
      const rgbConverted = await sharp(rgbData, { raw: { width, height, channels } })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      rgbData = rgbConverted.data
    }

    let dstBuffer

    if (blockNum === 0) {
      // 无需拼接，直接使用原始数据
      dstBuffer = rgbData
    } else {
      // 按 Rust stitch_img 的逻辑进行竖向分块重排
      const remainderHeight = height % blockNum
      const baseBlockHeight = Math.floor(height / blockNum)
      dstBuffer = Buffer.alloc(width * height * 3)

      // 逐块复制
      for (let i = 0; i < blockNum; i++) {
        let blockHeight = baseBlockHeight
        const srcImgYStart = height - baseBlockHeight * (i + 1) - remainderHeight
        let dstImgYStart = baseBlockHeight * i
        if (i === 0) {
          blockHeight += remainderHeight
        } else {
          dstImgYStart += remainderHeight
        }

        // 逐行复制当前块
        for (let y = 0; y < blockHeight; y++) {
          const srcY = srcImgYStart + y
          const dstY = dstImgYStart + y
          const srcOffset = srcY * width * 3
          const dstOffset = dstY * width * 3
          rgbData.copy(dstBuffer, dstOffset, srcOffset, srcOffset + width * 3)
        }
      }
    }

    // 编码为目标格式并写入
    let encoded
    const dstSharp = sharp(dstBuffer, { raw: { width, height, channels: 3 } })

    switch (downloadFormat) {
      case 'jpeg':
        encoded = await dstSharp.jpeg().toBuffer()
        break
      case 'png':
        // 对应 Rust 中 PNG 使用最佳压缩
        encoded = await dstSharp.png({ compressionLevel: 9 }).toBuffer()
        break
      case 'webp':
        encoded = await dstSharp.webp().toBuffer()
        break
      default:
        throw new Error(`Unsupported downloadFormat: ${downloadFormat}`)
    }

    return encoded
  }

  async get_scramble_id(id) {
    const ts = Math.floor(Date.now() / 1000)
    const query = {
      id,
      v: ts,
      mode: 'vertical',
      page: 0,
      app_img_shunt: 1,
      express: 'off'
    }
    const httpResp = await this.jm_get(ApiPath.GetScrambleId, query, ts)
    JmClient.ensureStatusOK(httpResp, '获取scramble_id失败')

    const body = typeof httpResp.data === 'string' ? httpResp.data : JSON.stringify(httpResp.data)
    // 提取 var scramble_id = N;
    const m = body.match(/var\s+scramble_id\s*=\s*(\d+)\s*;/)
    const scramble_id = m ? parseInt(m[1], 10) : 220980
    return scramble_id
  }

  async get_favorite_folder(folder_id, page, sort) {
    const ts = Math.floor(Date.now() / 1000)
    const query = {
      page,
      o: sort?.as_str ? sort.as_str() : sort,
      folder_id
    }
    const httpResp = await this.jm_get(ApiPath.GetFavoriteFolder, query, ts)
    JmClient.ensureStatusOK(httpResp, '获取收藏夹失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '获取收藏夹失败')
    const data = decrypt_data(ts, dataEnc)
    return JSON.parse(data)
  }

  async get_weekly_info() {
    const ts = Math.floor(Date.now() / 1000)
    const httpResp = await this.jm_get(ApiPath.GetWeeklyInfo, null, ts)
    JmClient.ensureStatusOK(httpResp, '获取每周必看信息失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '获取每周必看信息失败')
    const data = decrypt_data(ts, dataEnc)
    return JSON.parse(data)
  }

  async get_weekly(category_id, type_id) {
    const ts = Math.floor(Date.now() / 1000)
    const query = { id: category_id, type: type_id }
    const httpResp = await this.jm_get(ApiPath.GetWeekly, query, ts)
    JmClient.ensureStatusOK(httpResp, '获取每周必看信息失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '获取每周必看信息失败')
    const data = decrypt_data(ts, dataEnc)
    return JSON.parse(data)
  }

  async toggle_favorite_comic(aid) {
    const ts = Math.floor(Date.now() / 1000)
    const form = { aid }
    const httpResp = await this.jm_post(ApiPath.GetFavoriteFolder, null, form, ts)
    JmClient.ensureStatusOK(httpResp, '收藏/取消收藏 失败')

    const dataEnc = JmClient.parseJmRespText(httpResp, '收藏/取消收藏 失败')
    const data = decrypt_data(ts, dataEnc)
    return JSON.parse(data)
  }

  // 返回 [Bytes(Buffer), ImageFormat string: 'WebP'|'Gif']
  async get_img_data_and_format(url) {
    // 先请求一次
    let resp = await withRetry(() => this.img.get(url))
    if (resp.status !== 200) {
      const text = Buffer.from(resp.data || '').toString('utf8')
      throw new Error(`下载图片\`${url}\`失败，预料之外的状态码: ${text}`)
    }
    let buf = Buffer.from(resp.data)
    let headers = resp.headers

    if (!buf || buf.length === 0) {
      // 加时间戳避免缓存
      const ts = Math.floor(Date.now() / 1000)
      resp = await withRetry(() => this.img.get(url, { params: { ts } }))
      if (resp.status !== 200) {
        const text = Buffer.from(resp.data || '').toString('utf8')
        throw new Error(`下载图片\`${url}\`失败，预料之外的状态码: ${text}`)
      }
      buf = Buffer.from(resp.data)
      headers = resp.headers
    }

    const contentType = headers['content-type']
    if (!contentType) throw new Error('响应中没有content-type字段')

    let format
    if (contentType === 'image/webp') format = 'WebP'
    else if (contentType === 'image/gif') format = 'Gif'
    else throw new Error(`原图出现了意料之外的格式: ${contentType}`)

    return [buf, format]
  }
}

export {
  JmClient,
  IMAGE_DOMAIN,
  API_DOMAIN,
  // 工具导出以便测试
  md5_hex,
  decrypt_data
}

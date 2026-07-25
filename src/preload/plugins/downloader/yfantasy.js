import Api from './api.js'
import fsp from 'fs/promises'
import file from '../file.ts'

const BASE = 'https://api.yfantasy.me'
const REFERER = 'https://www.yfantasy.me/'

const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})

/**
 * 下载单个视频片段到本地（参考 pixiv.downloadImage，走 axios + Referer）
 * @param {string} url 片段地址
 * @param {string} savePath 完整保存路径（含文件名）
 */
async function downloadSegment(url, savePath) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: REFERER }
  })
  const data = Buffer.from(res)
  file.ensureDir(savePath)
  await fsp.writeFile(savePath, data)
}

export default {
  downloadSegment
}

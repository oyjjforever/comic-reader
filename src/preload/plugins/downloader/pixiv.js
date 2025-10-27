import Api from './api.js'
import fsp from 'fs/promises'
import file from '../file.ts'
import { ipcRenderer } from 'electron'
const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})
async function getArtworksByUserId(userId) {
  const cookies = await ipcRenderer.invoke('site:getCookies')
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/user/${userId}/profile/all?sensitiveFilterMode=userSetting&lang=zh`,
    headers: {
      Cookie: cookies
        .filter((_) => _.domain === '.pixiv.net')
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ')
    }
  })
  return {
    illusts: Object.keys(res.body.illusts || {}).reverse(),
    manga: Object.keys(res.body.manga || {}).reverse()
  }
}
async function getArtworkInfo(artworkId) {
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}?lang=zh`
  })
  return {
    title: res.body.title,
    author: res.body.userName,
    illustType: res.body.illustType
  }
}

async function getArtworkImages(artworkId) {
  const cookies = await ipcRenderer.invoke('site:getCookies')
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}/pages?lang=zh`,
    headers: {
      Cookie: cookies
        .filter((_) => _.domain === '.pixiv.net')
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ')
    }
  })
  return res.body
}
async function getImage(url) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://www.pixiv.net/' }
  })
  let imageStream = Buffer.from(res)
  const blob = new Blob([imageStream])
  const coverUrl = URL.createObjectURL(blob)
  return coverUrl
}

async function downloadImage(url, savePath) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://www.pixiv.net/' }
  })
  let imageData = Buffer.from(res)
  file.ensureDir(savePath)
  await fsp.writeFile(savePath, imageData)
}
async function downloadGif(artworkId, savePath) {
  const cookies = await ipcRenderer.invoke('site:getCookies')
  const info = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}/ugoira_meta?lang=zh`,
    headers: {
      Referer: 'https://www.pixiv.net/',
      Cookie: cookies
        .filter((_) => _.domain === '.pixiv.net')
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ')
    }
  })
  const url = info.body.originalSrc
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://www.pixiv.net/' }
  })
  let imageData = Buffer.from(res)
  file.ensureDir(`${savePath}/${artworkId}`)
  const filePath = `${savePath}/${artworkId}`
  await fsp.writeFile(`${filePath}.zip`, imageData)
  await file.extractFile(`${filePath}.zip`, `${filePath}`)

  const fs = require('fs')
  const GIFEncoder = require('gif-encoder-2')

  // 图片帧的路径列表
  const imagePaths = info.body.frames.map((_) => `${filePath}/${_.file}`)

  // 创建一个GIFEncoder实例
  const encoder = new GIFEncoder(1920, 1080) // 设置宽度和高度
  encoder
    .createReadStream()
    .pipe(fs.createWriteStream(`${savePath}/output.gif`)) // 设置输出文件的路径
    .on('finish', () => console.log('GIF created successfully!')) // 完成后的回调
  encoder.start()
  encoder.setDelay(20)
  // 添加每个帧到GIF
  imagePaths.forEach((imagePath) => {
    encoder.addFrame(fs.createReadStream(imagePath)) // 添加帧
  })

  // 结束并输出GIF文件
  encoder.finish()
}
export default {
  getArtworksByUserId,
  getArtworkInfo,
  getArtworkImages,
  getImage,
  downloadImage,
  downloadGif
}

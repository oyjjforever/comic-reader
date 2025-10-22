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
    illusts: res.body.illusts,
    manga: res.body.manga
  }
}
async function getArtworkInfo(artworkId) {
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}?lang=zh`
  })
  return {
    title: res.body.title,
    author: res.body.userName
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
  return res.body.map((_) => _.urls.original)
}

async function downloadImage(url, savePath) {
  const res = await api.get({
    url,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://www.pixiv.net/' }
  })
  let imageData = Buffer.from(res)
  file.ensureDir(savePath)
  fsp.writeFile(savePath, imageData)
}

export default {
  getArtworksByUserId,
  getArtworkInfo,
  getArtworkImages,
  downloadImage
}

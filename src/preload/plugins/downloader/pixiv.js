import Api from './api.js'
import path from 'path'
import { ipcRenderer } from 'electron'
const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})
async function getArtworksByUserId(userId) {
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/user/${userId}/profile/all?sensitiveFilterMode=userSetting&lang=zh`
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
  const res = await api.get({
    url: `https://www.pixiv.net/ajax/illust/${artworkId}/pages?lang=zh`
  })
  return res.body.map((_) => _.urls.original)
}

async function downloadImage(url, savePath) {
  const dir = path.dirname(savePath)
  const fileName = path.basename(savePath)
  await ipcRenderer.invoke('download:start', {
    url,
    fileName,
    savePath: dir,
    autoExtract: false,
    headers: { Referer: 'https://www.pixiv.net/' }
  })
}

export default {
  getArtworksByUserId,
  getArtworkInfo,
  getArtworkImages,
  downloadImage
}

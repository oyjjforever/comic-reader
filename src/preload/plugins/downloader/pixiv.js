import Api from './api.js'
import fsp from 'fs/promises'
import file from '../file.ts'
import { ipcRenderer } from 'electron'
import { spawnSync } from 'child_process'
import path from 'path'
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
  file.ensureDir(`${savePath}/${temp}`)
  const filePath = `${savePath}/${temp}`
  await fsp.writeFile(`${filePath}.zip`, imageData)
  await file.extractFile(`${filePath}.zip`, `${filePath}`)
  await generateGif(filePath)
}
async function generateGif(folder) {
  // 先检查并安装依赖
  if (!checkAndInstallDependencies()) {
    console.error('依赖安装失败，无法执行 Python 脚本')
    return
  }
  const result = spawnSync('python', ['python_scripts/gif.py', folder])
  if (result.error) {
    console.error(`spawnSync error: ${result.error}`)
    return
  }
}

function checkAndInstallDependencies() {
  try {
    // 尝试导入 imageio 库来检查是否已安装
    const checkResult = spawnSync('python', ['-c', "import imageio; print('imageio is installed')"])
    if (checkResult.status !== 0) {
      console.log('检测到未安装 imageio 库，正在安装...')
      // 安装 imageio
      const installResult = spawnSync('pip', ['install', 'imageio'], {
        stdio: 'inherit' // 显示安装过程输出
      })
      if (installResult.status !== 0) {
        console.error('安装 imageio 失败')
        return false
      }
      console.log('imageio 安装成功')
    } else {
      console.log('imageio 已安装')
    }
    return true
  } catch (error) {
    console.error('检查依赖时出错:', error)
    return false
  }
}
export default {
  getArtworksByUserId,
  getArtworkInfo,
  getArtworkImages,
  getImage,
  downloadImage,
  downloadGif
}

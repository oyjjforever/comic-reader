import Api from './api.js'
import fsp from 'fs/promises'
import file from '../file.ts'
import { spawnSync, spawn } from 'child_process'
import path from 'path'
const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})
function headers(cookies) {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    'client-version': 'v2.47.52',
    pragma: 'no-cache',
    priority: 'u=1, i',
    referer: 'https://weibo.com/',
    'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'server-version': 'v2025.04.14.3',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'x-requested-with': 'XMLHttpRequest',
    'x-xsrf-token': '-oaYltmtgzHLdS2EPpryNKQ-',
    Cookie: cookies
  }
}
async function getMediaPerPage(userId, sinceid) {
  const cookies = await api.getCookies('.weibo.com')
  const res = await api.get({
    url: `https://weibo.com/ajax/profile/getImageWall?uid=${userId}&sinceid=${sinceid}&has_album=true`,
    headers: headers(cookies)
  })
  return res
}
async function getAllMedia(userId) {
  let sinceid = '0'
  let artworkList = []

  while (true) {
    const res = await getMediaPerPage(userId, sinceid)
    artworkList.push(...res.data.list)
    sinceid = res.data.since_id
    if (!res.data.list.length) break
  }
}
async function getAuthorNameById(userId) {
  const cookies = await api.getCookies('.weibo.com')
  const res = await api.get({
    url: `https://weibo.com/ajax/profile/info?uid=${userId}`,
    headers: headers(cookies)
  })
  return res.data.user.screen_name
}

async function getAuthorIdByName(userName) {
  const cookies = await api.getCookies('.weibo.com')
  const res = await api.get({
    url: `https://weibo.com/ajax/profile/info?screen_name=${encodeURIComponent(userName)}`,
    headers: headers(cookies)
  })
  return String(res.data.user.id)
}

async function getImage(pid) {
  const res = await api.get({
    url:`https://wx2.sinaimg.cn/large/${pid}.jpg`,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://weibo.com/' }
  })
  let imageStream = Buffer.from(res)
  const blob = new Blob([imageStream])
  const coverUrl = URL.createObjectURL(blob)
  return coverUrl
}

async function downloadImage(pid, savePath) {
  const res = await api.get({
    url:`https://wx2.sinaimg.cn/large/${pid}.jpg`,
    responseType: 'arraybuffer',
    headers: { Referer: 'https://weibo.com/' }
  })
  let imageData = Buffer.from(res)
  file.ensureDir(savePath)
  await fsp.writeFile(savePath, imageData)
}

export default {
  getAuthorNameById,
  getAuthorIdByName,
  getMediaPerPage,
  getAllMedia,
  getImage,
  downloadImage
}

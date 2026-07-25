const { pixiv, file } = window
import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
const settingStore = useSettingStore(pinia)
async function addToQueue(artworkIds) {
  const downloadPath =
    settingStore.setting?.downloadPathPixiv || settingStore.setting?.defaultDownloadPath
  for (const artworkId of artworkIds) {
    const artworkInfo = await pixiv.getArtworkInfo(artworkId)
    queue.addTask({
      site: 'pixiv',
      title: `[${artworkInfo.author}]${artworkInfo.title}`,
      payload: {
        artworkId,
        artworkInfo,
        baseDir: downloadPath
      }
    })
  }
}
async function searchArtworks(keyword, page = 1) {
  const res = await pixiv.searchByPage(keyword, page)
  return (res?.data || []).map((_) => _.id)
}
async function downloadArtwork(artworkId) {
  addToQueue([artworkId])
}
async function downloadIllusts(authorId) {
  const profile = await pixiv.getArtworksByUserId(authorId)
  const artworkIds = profile.illusts
  addToQueue(artworkIds)
}
async function downloadAllMedia(authorName, authorId) {
  const profile = await pixiv.getArtworksByUserId(authorId)
  const artworkIds = profile.illusts.concat(profile.manga)
  addToQueue(artworkIds)
}
// 追更：从新到旧遍历，连续5个已下载则结束
async function downloadNewMedia(authorName, authorId, onProgress) {
  const profile = await pixiv.getArtworksByUserId(authorId)
  const artworkIds = profile.illusts.concat(profile.manga).sort((a, b) => b - a)
  const newIds = []
  let consecutiveDownloaded = 0
  for (const id of artworkIds) {
    try {
      const info = await pixiv.getArtworkInfo(id)
      if (await isLocalDownloaded(authorName, info.title, id)) {
        if (++consecutiveDownloaded >= 5) break
      } else {
        consecutiveDownloaded = 0
        newIds.push(id)
        if (onProgress) onProgress(newIds.length, id)
      }
    } catch (e) {
      console.error(`检查作品 ${id} 失败:`, e)
    }
  }
  addToQueue(newIds)
  return newIds.length
}
async function downloadManga(mangaId) {
  const mangaInfo = await pixiv.getMangaInfo(mangaId)
  const artworkIds = mangaInfo.series
  addToQueue(artworkIds)
}
async function fetchArtworks(authorId) {
  // 获取作品集
  const profile = await pixiv.getArtworksByUserId(authorId)
  return profile.illusts.concat(profile.manga).sort((a, b) => b - a)
}
async function previewImage(url) {
  const blobUrl = await pixiv.getImage(url)
  return blobUrl
}
async function hasNewArtwork(authorName, authorId) {
  try {
    const ids = await fetchArtworks(authorId)
    const id = ids[0]
    const info = await pixiv.getArtworkInfo(id)
    const downloaded = await isLocalDownloaded(authorName, info.title, id)
    return !downloaded
  } catch (error) {
    return false
  }
}
const typeMap = {
  0: null, //'插画',
  1: null, //'漫画',
  2: 'GIF'
}
async function getArtworkInfo(artworkId) {
  const [info, images] = await Promise.all([
    pixiv.getArtworkInfo(artworkId),
    pixiv.getArtworkImages(artworkId)
  ])
  // 获取图片流并转换为Blob URL
  const coverUrl = await previewImage(images[0].urls.small) //thumb_mini
  // 检测本地是否已下载
  const downloaded = await isLocalDownloaded(info.author, info.title, artworkId)
  return {
    artworkId,
    author: info.author,
    title: info.title || '',
    illustType: info.illustType,
    artworkType: typeMap[info.illustType],
    cover: coverUrl,
    pages: images.length,
    imageUrls: images.map((image) => image.urls.original),
    downloaded
  }
}
async function pagingImage(authorName, authorId, grid, page) {
  const start = page.index * page.size
  const ids = grid.allRows.slice(start, start + page.size)
  const promises = ids.map(async (id) => {
    try {
      // 获取作品详情
      const artworkInfo = await getArtworkInfo(id)
      return artworkInfo
    } catch (error) {
      console.error(`获取作品 ${id} 信息失败:`, error)
      return {}
    }
  })
  return await Promise.all(promises)
}

function isLocalDownloaded(authorName, workName, artworkId) {
  const downloadPath =
    settingStore.setting?.downloadPathPixiv || settingStore.setting?.defaultDownloadPath
  const workDir = `${downloadPath}/${file.simpleSanitize(authorName)}/${file.simpleSanitize(workName)}`
  return file.existsArtworkFiles(workDir, artworkId)
}
import { extractFromUrl } from '@renderer/plugins/site-utils/utils.js'

const siteView = {
  url: 'https://www.pixiv.net/',
  updateStatus(currentUrl) {
    let downloadType = null
    let canDownload = true
    if (currentUrl.includes('artworks')) {
      downloadType = 'artwork'
    } else if (currentUrl.includes('illustrations')) {
      downloadType = 'illusts'
    } else if (currentUrl.includes('series')) {
      downloadType = 'managa'
    } else {
      canDownload = false
    }
    const canAttention = !!currentUrl && currentUrl.includes('users')
    return { canDownload, canAttention, extra: { downloadType } }
  },
  async download({ extra, getCurrentUrl, tip }) {
    if (extra.downloadType === 'artwork') {
      const artworkId = extractFromUrl(getCurrentUrl(), 'artworks')
      if (!artworkId) throw new Error('未获取到作品ID')
      await downloadArtwork(artworkId)
    } else if (extra.downloadType === 'illusts') {
      const userId = extractFromUrl(getCurrentUrl(), 'users')
      if (!userId) throw new Error('未获取到用户ID')
      await downloadIllusts(userId)
    } else if (extra.downloadType === 'managa') {
      const mangaId = extractFromUrl(getCurrentUrl(), 'series')
      if (!mangaId) throw new Error('未获取到漫画ID')
      await downloadManga(mangaId)
    }
  },
  async addSpecialAttention({ getCurrentUrl, tip }) {
    const userId = extractFromUrl(getCurrentUrl(), 'users')
    const firstArtworkId = (await pixiv.getArtworksByUserId(userId)).illusts[0]
    const authorName = (await pixiv.getArtworkInfo(firstArtworkId)).author
    await window.specialAttention.add({
      source: 'pixiv',
      authorId: userId,
      authorName
    })
    tip.success('已添加到特别关注')
  }
}

export default {
  siteView,
  downloadArtwork,
  downloadIllusts,
  downloadAllMedia,
  downloadNewMedia,
  downloadManga,
  getArtworkInfo,
  fetchArtworks,
  pagingImage,
  previewImage,
  hasNewArtwork,
  searchArtworks,
  isLocalDownloaded
}

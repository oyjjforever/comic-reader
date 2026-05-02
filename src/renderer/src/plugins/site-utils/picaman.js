const { picaman, file } = window
import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
const settingStore = useSettingStore(pinia)

async function downloadArtwork(authorName, comicId) {
  const downloadPath =
    settingStore.setting?.downloadPathPicaman || settingStore.setting?.defaultDownloadPath
  // 获取漫画详情
  let comicInfo
  try {
    comicInfo = await picaman.getComicInfo(comicId)
  } catch (e) {
    console.error(`获取作品信息失败：${e?.message || e}`)
    return
  }
  queue.addTask({
    site: 'picaman',
    title: `[${comicInfo.author || authorName || '未知'}]${comicInfo.title || comicId}`,
    payload: {
      comicInfo,
      baseDir: downloadPath
    }
  })
}

async function searchArtworks(keyword, page = 1) {
  const res = await picaman.search(keyword, page)
  if (res?.comics) return res.comics.map((_) => _.id)
  return []
}

async function fetchArtworks(tag) {
  const res = await picaman.searchByTag(tag)
  return res
}

async function previewImage(url) {
  const blobUrl = await picaman.getImage(url)
  return blobUrl
}

async function getArtworkInfo(artworkId) {
  const comicInfo = await picaman.getComicInfo(artworkId)
  // 获取封面
  const coverUrl = await previewImage(comicInfo.imgList[0]?.url)
  // 检测本地是否已下载
  const downloaded = isLocalDownloaded(comicInfo.author, comicInfo.name)
  return {
    artworkId,
    author: comicInfo.author || '',
    title: comicInfo.title || '',
    cover: coverUrl,
    pages: comicInfo.imgList.length,
    imageUrls: comicInfo.imgList.map((img) => img.url),
    downloaded
  }
}

async function pagingImage(authorName, authorId, grid, page) {
  const start = page.index * page.size
  const ids = grid.allRows.slice(start, start + page.size)
  const promises = ids.map(async (id) => {
    try {
      const artworkInfo = await getArtworkInfo(id)
      return artworkInfo
    } catch (error) {
      console.error(`获取作品 ${id} 信息失败:`, error)
      return {}
    }
  })
  return await Promise.all(promises)
}

function isLocalDownloaded(authorName, workName) {
  const downloadPath =
    settingStore.setting?.downloadPathPicaman || settingStore.setting?.defaultDownloadPath
  const localPath = `${downloadPath}/${file.simpleSanitize(authorName || '未知')}/${file.simpleSanitize(workName)}`
  return file.pathExists(localPath)
}

async function hasNewArtwork(authorName, authorId) {
  try {
    const res = await picaman.searchByTag(authorId)
    const ids = res?.list || []
    if (!ids.length) return false
    const info = await picaman.getComicInfo(ids[0].id || ids[0])
    const downloaded = isLocalDownloaded(authorName, info.name)
    return !downloaded
  } catch (error) {
    return false
  }
}

const siteView = {
  url: 'https://www.wnacg.com/',
  updateStatus(currentUrl) {
    const match = currentUrl.match(/photos-(?:index|slide)-aid-(\d+)/)
    if (match) {
      return { canDownload: true, canAttention: false, extra: { comicId: match[1] } }
    }
    return { canDownload: false, canAttention: false, extra: {} }
  },
  async download({ extra }) {
    if (extra.comicId) {
      await downloadArtwork(null, extra.comicId)
    }
  }
  // picaman 不支持特别关注，不提供 addSpecialAttention
}

export default {
  siteView,
  downloadArtwork,
  getArtworkInfo,
  fetchArtworks,
  pagingImage,
  previewImage,
  hasNewArtwork,
  searchArtworks,
  isLocalDownloaded
}

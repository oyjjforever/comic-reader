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
async function downloadArtwork(artworkId) {
  addToQueue([artworkId])
}
async function downloadAllMedia(authorName, authorId) {
  const profile = await pixiv.getArtworksByUserId(authorId)
  const artworkIds = profile.illusts.concat(profile.manga)
  addToQueue(artworkIds)
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
    const downloaded = isLocalDownloaded(authorName, info.title)
    return !downloaded
  } catch (error) {
    return false
  }
}
async function pagingImage(authorName, authorId, grid, page) {
  const start = page.index * page.size
  const ids = grid.allRows.slice(start, start + page.size)
  const promises = ids.map(async (id) => {
    try {
      const [info, images] = await Promise.all([
        pixiv.getArtworkInfo(id),
        pixiv.getArtworkImages(id)
      ])
      // 检测本地是否已下载
      const downloaded = isLocalDownloaded(authorName, info.title)
      // 获取图片流并转换为Blob URL
      const coverUrl = await previewImage(images[0].urls.small) //thumb_mini
      return {
        artworkId: id,
        author: authorName,
        title: info.title || '',
        illustType: info.illustType,
        cover: coverUrl,
        pages: images.length,
        imageUrls: images.map((image) => image.urls.original),
        downloaded
      }
    } catch (error) {
      console.error(`获取作品 ${id} 信息失败:`, error)
      return {}
    }
  })
  return await Promise.all(promises)
}

function isLocalDownloaded(authorName, workName) {
  const downloadPath =
    settingStore.setting?.downloadPathPixiv || settingStore.setting?.defaultDownloadPath
  const localPath = `${downloadPath}/${file.simpleSanitize(authorName)}/${file.simpleSanitize(workName)}`
  return file.pathExists(localPath)
}
export default {
  downloadArtwork,
  downloadAllMedia,
  downloadManga,
  fetchArtworks,
  pagingImage,
  previewImage,
  hasNewArtwork,
  isLocalDownloaded
}

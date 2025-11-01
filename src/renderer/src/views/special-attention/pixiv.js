const { pixiv, file } = window
import { useSettingStore, pinia } from '@renderer/plugins/store'
const settingStore = useSettingStore(pinia)

async function fetchArtworks(authorId) {
  // 获取作品集
  const profile = await pixiv.getArtworksByUserId(authorId)
  return profile.illusts
}

async function pagingImage(authorName, grid, page) {
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
      const coverUrl = await pixiv.getImage(images[0].urls.small) //thumb_mini
      return {
        artworkId: id,
        author: authorName,
        title: info.title || '',
        illustType: info.illustType,
        cover: coverUrl,
        pages: images.length,
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
  fetchArtworks,
  pagingImage,
  isLocalDownloaded
}

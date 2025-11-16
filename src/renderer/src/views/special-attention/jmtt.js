const { jmtt, file } = window
import { useSettingStore, pinia } from '@renderer/plugins/store'
const settingStore = useSettingStore(pinia)

async function fetchArtworks(authorId) {
  // 获取作品集
  const res = await jmtt.getComicsByAuthor(authorId)
  return res?.data?.content.filter((_) => _.author === authorId).map((_) => _.id) || []
}

async function pagingImage(authorName, grid, page) {
  const start = page.index * page.size
  const ids = grid.allRows.slice(start, start + page.size)
  const promises = ids.map(async (id) => {
    try {
      const comicInfo = await jmtt.getComicInfo(id)
      const firstComic = comicInfo.chapter_infos[0]
      // 检测本地是否已下载
      const downloaded = isLocalDownloaded(authorName, comicInfo.name)
      // 获取图片流并转换为Blob URL
      const firstComicImages = await jmtt.getChapterImages(firstComic.id)
      const coverUrl = await jmtt.getImage(firstComicImages[0])
      return {
        artworkId: id,
        author: authorName,
        comicInfo,
        title: comicInfo.name || '',
        cover: coverUrl,
        pages: firstComicImages.length,
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

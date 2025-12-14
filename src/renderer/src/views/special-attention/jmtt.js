const { jmtt, file } = window
import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
const settingStore = useSettingStore(pinia)

async function downloadArtwork(comicId) {
  const downloadPath = settingStore.setting?.downloadPathJmtt || settingStore.setting?.downloadPath
  // 获取漫画详情
  let comicInfo
  try {
    comicInfo = await jmtt.getComicInfo(comicId)
  } catch (e) {
    tip.error(`获取章节失败：${e?.message || e}`)
    return
  }
  queue.addTask(
    comicInfo.chapter_infos.map((chapter) => ({
      site: 'jmtt',
      title: `[${comicInfo.author}]${comicInfo.name} - 第${chapter.index}章`,
      payload: {
        chapter,
        comicInfo,
        baseDir: downloadPath
      }
    }))
  )
}
async function downloadAll(authorName) {
  const res = await jmtt.getComicsByAuthor(authorName)
  const comics = res?.data?.content || []
  for (const comic of comics) {
    downloadArtwork(comic.id)
  }
}
async function fetchArtworks(authorId) {
  // 获取作品集
  const res = await jmtt.getComicsByAuthor(authorId)
  // return res?.data?.content.filter((_) => _.author === authorId).map((_) => _.id) || []
  return res?.data?.content.map((_) => _.id) || []
}
async function previewImage(url) {
  const blobUrl = await jmtt.getImage([url[0], url[1]])
  return blobUrl
}
async function hasNewArtwork(authorName, authorId) {
  try {
    const ids = await fetchArtworks(authorId)
    const id = ids[0]
    const info = await jmtt.getComicInfo(id)
    const downloaded = isLocalDownloaded(authorName, info.name)
    return !downloaded
  } catch (error) {
    return false
  }
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
      const coverUrl = await previewImage(firstComicImages[0])
      return {
        artworkId: id,
        author: authorName,
        // comicInfo,
        title: comicInfo.name || '',
        cover: coverUrl,
        pages: firstComicImages.length,
        imageUrls: firstComicImages,
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
    settingStore.setting?.downloadPathJmtt || settingStore.setting?.defaultDownloadPath
  const localPath = `${downloadPath}/${file.simpleSanitize(authorName)}/${file.simpleSanitize(workName)}`
  return file.pathExists(localPath)
}
export default {
  downloadArtwork,
  downloadAll,
  fetchArtworks,
  pagingImage,
  previewImage,
  hasNewArtwork,
  isLocalDownloaded
}

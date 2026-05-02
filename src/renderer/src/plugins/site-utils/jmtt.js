const { jmtt, file } = window
import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'
const settingStore = useSettingStore(pinia)

async function downloadArtwork(authorName, comicId) {
  const downloadPath = settingStore.setting?.downloadPathJmtt || settingStore.setting?.downloadPath
  // 获取漫画详情
  let comicInfo
  try {
    comicInfo = await jmtt.getComicInfo(comicId)
    comicInfo.author = authorName || comicInfo.author[0] // 使用搜索时的作者名，避免简繁体转换问题
  } catch (e) {
    console.error(`获取作品信息失败：${e?.message || e}`)
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
async function downloadAllMedia(authorName, authorId) {
  const res = await jmtt.getComicsByAuthor(authorName)
  const comics = res?.data?.content || []
  for (const comic of comics) {
    downloadArtwork(authorName, comic.id)
  }
}
async function searchArtworks(keyword, page = 1) {
  const res = await jmtt.search(keyword, page)
  if (res.type === 'ComicRespData') return [res.data]
  if (res.type === 'SearchRespData') return res.data.content.map((_) => _.id)
  return []
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
async function getArtworkInfo(artworkId) {
  const comicInfo = await jmtt.getComicInfo(artworkId)
  const firstComic = comicInfo.chapter_infos[0]
  // 获取图片流并转换为Blob URL
  const firstComicImages = await jmtt.getChapterImages(firstComic.id)
  const coverUrl = await previewImage(firstComicImages[0])
  // 检测本地是否已下载
  const downloaded = isLocalDownloaded(comicInfo.author[0], comicInfo.name)
  return {
    artworkId,
    author: comicInfo.author[0],
    title: comicInfo.name || '',
    cover: coverUrl,
    pages: firstComicImages.length,
    imageUrls: firstComicImages,
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
    settingStore.setting?.downloadPathJmtt || settingStore.setting?.defaultDownloadPath
  const localPath = `${downloadPath}/${file.simpleSanitize(authorName)}/${file.simpleSanitize(workName)}`
  return file.pathExists(localPath)
}
const siteView = {
  url: 'https://jmcomic-zzz.one/',
  updateStatus(currentUrl) {
    const match = currentUrl.match(/\/album\/(\d+)/)
    const isBatch = currentUrl.includes('main_tag=2')
    let searchQuery = null
    if (isBatch) {
      try {
        const urlObj = new URL(currentUrl)
        searchQuery = decodeURIComponent(urlObj.searchParams.get('search_query'))
      } catch {
        searchQuery = null
      }
    }
    return {
      canDownload: !!(match || isBatch),
      canAttention: isBatch,
      extra: {
        comicId: match ? match[1] : null,
        downloadType: match ? 'one' : isBatch ? 'batch' : null,
        searchQuery
      }
    }
  },
  async download({ extra }) {
    if (extra.downloadType === 'one') {
      await downloadArtwork(null, extra.comicId)
    } else if (extra.downloadType === 'batch') {
      await downloadAllMedia(extra.searchQuery)
    }
  },
  async addSpecialAttention({ extra, tip }) {
    await window.specialAttention.add({
      source: 'jmtt',
      authorId: extra.searchQuery,
      authorName: extra.searchQuery
    })
    tip.success('已添加到特别关注')
  },
  onMounted(webview) {
    const { jmtt, file } = window
    const onDownloadPrepare = async (event, data) => {
      let defaultDownloadPath = await getDefaultDownloadPath('downloadPathJmtt')
      // 获取文件名称
      const currentUrl = typeof webview.getURL === 'function' ? webview.getURL() : webview.src
      const match = currentUrl.match(/\/album_download\/(\d+)/)
      const comicId = match ? match[1] : null
      const comicInfo = await jmtt.getComicInfo(comicId)
      try {
        await window.electron.ipcRenderer.invoke('download:start', {
          fileName: `${file.simpleSanitize(comicInfo.name)}.zip`,
          url: data.url,
          savePath: `${defaultDownloadPath}/${comicInfo.author[0] || '未分类'}`,
          autoExtract: true
        })
      } catch (e) {
        console.error(`下载失败：${e?.message || e}`)
      }
    }
    window.electron.ipcRenderer.on('download:prepare', onDownloadPrepare)
    // 返回清理函数
    return () => {
      window.electron.ipcRenderer.removeListener('download:prepare', onDownloadPrepare)
    }
  }
}

export default {
  siteView,
  downloadArtwork,
  downloadAllMedia,
  getArtworkInfo,
  fetchArtworks,
  pagingImage,
  previewImage,
  hasNewArtwork,
  searchArtworks,
  isLocalDownloaded
}

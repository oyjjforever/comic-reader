const { weibo, file } = window
import { queue } from '@renderer/plugins/store/downloadQueue'
import { useSettingStore, pinia } from '@renderer/plugins/store'
const settingStore = useSettingStore(pinia)
let cursors = {}

async function downloadArtwork(authorName, authorId, pid) {
  const downloadPath =
    settingStore.setting?.downloadPathWeibo || settingStore.setting?.defaultDownloadPath
  queue.addTask({
    site: 'weibo',
    title: `[${authorName}]${pid}`,
    payload: {
      author: authorName,
      userId: authorId,
      artworkInfo: {
        author: authorName,
        title: pid,
        url: pid
      },
      baseDir: downloadPath
    }
  })
}
async function downloadAllMedia(authorName, authorId) {
  const downloadPath =
    settingStore.setting?.downloadPathWeibo || settingStore.setting?.defaultDownloadPath
  queue.addTask({
    site: 'weibo',
    title: `[${authorName}]的相册`,
    payload: {
      author: authorName,
      userId: authorId,
      baseDir: downloadPath
    }
  })
}

async function previewImage(pid) {
  const blobUrl = await weibo.getImage(pid)
  return blobUrl
}
async function hasNewArtwork(authorName, authorId) {
  try {
    const res = await weibo.getMediaPerPage(authorId, null, 10)
    const images = res.data.list.filter((_) => _.pid) || []
    const image = images[0]
    const downloaded = isLocalDownloaded(authorName, image.pid)
    return !downloaded
  } catch (error) {
    return false
  }
}
async function pagingImage(authorName, authorId, grid, page) {
  const pageSize = page?.size || 20
  const pageIndex = page?.index || 0

  // 缓存命名：同作者同页码同页大小
  const cacheKey = `${authorId}_${pageIndex}_${pageSize}`
  if (!window.__twitterPagingCache) window.__twitterPagingCache = new Map()
  const cache = window.__twitterPagingCache
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  // 取上一页的 cursor 作为起点
  let cursor = cursors[pageIndex - 1] || null
  let collected = []
  let nextCursor = null

  // 循环请求，直到收集满一页或无更多
  while (collected.length < pageSize) {
    const res = await weibo.getMediaPerPage(authorId, cursor, 50)
    const images = res.data.list.filter((_) => _.pid) || []
    nextCursor = res.data.since_id || null

    if (images.length) collected.push(...images)

    // 没有更多可用数据则跳出
    if (!nextCursor || images.length === 0) break
    cursor = nextCursor
  }

  // 当前页数据固定为 pageSize（不足则返回现有）
  const currentPageImages = collected.slice(0, pageSize)
  // 记录下一页起点所需的 cursor
  cursors[pageIndex] = nextCursor || cursor || null

  const promises = currentPageImages.map(async (image) => {
    try {
      const downloaded = isLocalDownloaded(authorName, image.pid)
      const coverUrl = await previewImage(image.pid)
      return {
        artworkId: image.pid,
        author: authorName,
        title: image.pid || '',
        cover: coverUrl,
        url: image.url,
        pages: 1,
        imageUrls: [image.pid],
        downloaded
      }
    } catch (error) {
      console.error(`获取作品 ${image?.id} 信息失败:`, error)
      return null
    }
  })
  const result = (await Promise.all(promises)).filter(Boolean)

  // 缓存结果
  cache.set(cacheKey, result)

  // 预缓存下一页（异步，不影响当前返回）
  const nextCacheKey = `${authorId}_${pageIndex + 1}_${pageSize}`
  if (!cache.has(nextCacheKey) && (collected.length > pageSize || cursors[pageIndex])) {
    setTimeout(async () => {
      try {
        // 以当前记录的 next cursor 继续拉取，凑满下一页
        let prefetchCursor = cursors[pageIndex] || null
        let preCollected = []
        let preNext = null
        while (preCollected.length < pageSize && prefetchCursor !== undefined) {
          const r = await weibo.getMediaPerPage(authorId, prefetchCursor, 50)
          const imgs = r.data.list.filter((_) => _.pid) || []
          preNext = r.data.since_id || null
          if (imgs.length) preCollected.push(...imgs)
          if (!preNext || imgs.length === 0) break
          prefetchCursor = preNext
        }
        const nextImages = preCollected.slice(0, pageSize)
        const nextRows = await Promise.all(
          nextImages.map(async (image) => {
            try {
              const downloaded = isLocalDownloaded(authorName, image.pid)
              const coverUrl = await previewImage(image.pid)
              return {
                artworkId: image.pid,
                author: authorName,
                title: image.pid || '',
                cover: coverUrl,
                url: image.url,
                pages: 1,
                imageUrls: [image.pid],
                downloaded
              }
            } catch {
              return null
            }
          })
        )
        cache.set(nextCacheKey, nextRows.filter(Boolean))
        cursors[pageIndex + 1] = preNext || prefetchCursor || null
      } catch {}
    }, 0)
  }

  return result
}

function isLocalDownloaded(authorName, workName) {
  const downloadPath =
    settingStore.setting?.downloadPathWeibo || settingStore.setting?.defaultDownloadPath
  const localPath = `${downloadPath}/${file.simpleSanitize(authorName)}/${file.simpleSanitize(workName)}`
  return file.pathExists(localPath)
}
import { extractFromUrl } from '@renderer/plugins/site-utils/utils.js'

const siteView = {
  url: 'https://weibo.com/',
  updateStatus(currentUrl) {
    const authorIdBySearch = extractFromUrl(currentUrl, 'weibo.com')
    const authorId = ['n', 'u'].includes(authorIdBySearch)
      ? extractFromUrl(currentUrl, 'u')
      : authorIdBySearch.split('?')[0]
    const authorName = extractFromUrl(currentUrl, 'n')
    const canDownload = !!authorId || !!authorName
    const canAttention = !!authorId || !!authorName
    return { canDownload, canAttention, extra: { authorIdBySearch } }
  },
  async download({ getCurrentUrl, tip }) {
    const authorIdBySearch = extractFromUrl(getCurrentUrl(), 'weibo.com')
    let authorId = ['n', 'u'].includes(authorIdBySearch)
      ? extractFromUrl(getCurrentUrl(), 'u')
      : authorIdBySearch.split('?')[0]
    let authorName = extractFromUrl(getCurrentUrl(), 'n')
    if (authorId && !authorName) authorName = await weibo.getAuthorNameById(authorId)
    if (authorName && !authorId) authorId = await weibo.getAuthorIdByName(authorName)
    await downloadAllMedia(authorName, authorId)
  },
  async addSpecialAttention({ getCurrentUrl, tip }) {
    const authorIdBySearch = extractFromUrl(getCurrentUrl(), 'weibo.com')
    let authorId = ['n', 'u'].includes(authorIdBySearch)
      ? extractFromUrl(getCurrentUrl(), 'u')
      : authorIdBySearch.split('?')[0]
    let authorName = extractFromUrl(getCurrentUrl(), 'n')
    if (authorId && !authorName) authorName = await weibo.getAuthorNameById(authorId)
    if (authorName && !authorId) authorId = await weibo.getAuthorIdByName(authorName)
    await window.specialAttention.add({
      source: 'weibo',
      authorId,
      authorName
    })
    tip.success('已添加到特别关注')
  },
  onMounted(webview) {
    webview.addEventListener('dom-ready', () => {
      webview.executeJavaScript(`
    // 重写window.open
    const originalOpen = window.open;
    window.open = function(url, target, features) {
      // 在当前窗口打开
      window.location.href = url;
      return null;
    };
    
    // 拦截所有链接点击
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link && link.target === '_blank') {
        e.preventDefault();
        window.location.href = link.href;
      }
    });
  `)
    })
  }
}

export default {
  siteView,
  downloadArtwork,
  downloadAllMedia,
  pagingImage,
  previewImage,
  hasNewArtwork,
  isLocalDownloaded
}

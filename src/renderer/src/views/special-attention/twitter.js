const { twitter, file } = window
import { useSettingStore, pinia } from '@renderer/plugins/store'
const settingStore = useSettingStore(pinia)
let cursors = {}
async function fetchArtworks(authorId) {
  // 获取作品集
  const profile = await pixiv.getArtworksByUserId(authorId)
  return profile.illusts
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
    const res = await twitter.getMediaPerPage(authorId, cursor, 50)
    const images = twitter.extractItemsFromJson(res) || []
    nextCursor = twitter.extractBottomCursorValues(res) || null

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
      const downloaded = isLocalDownloaded(authorName, image.title)
      const coverUrl = await twitter.getImage(image.url)
      return {
        artworkId: image.id,
        author: authorName,
        title: image.title || '',
        cover: coverUrl,
        url: image.url,
        pages: 1,
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
          const r = await twitter.getMediaPerPage(authorId, prefetchCursor, 50)
          const imgs = twitter.extractItemsFromJson(r) || []
          preNext = twitter.extractBottomCursorValues(r) || null
          if (imgs.length) preCollected.push(...imgs)
          if (!preNext || imgs.length === 0) break
          prefetchCursor = preNext
        }
        const nextImages = preCollected.slice(0, pageSize)
        const nextRows = await Promise.all(
          nextImages.map(async (image) => {
            try {
              const downloaded = isLocalDownloaded(authorName, image.title)
              const coverUrl = await twitter.getImage(image.url)
              return {
                artworkId: image.id,
                author: authorName,
                title: image.title || '',
                cover: coverUrl,
                url: image.url,
                pages: 1,
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
    settingStore.setting?.downloadPathPixiv || settingStore.setting?.defaultDownloadPath
  const localPath = `${downloadPath}/${file.simpleSanitize(authorName)}/${file.simpleSanitize(workName)}`
  return file.pathExists(localPath)
}
export default {
  fetchArtworks,
  pagingImage,
  isLocalDownloaded
}

/**
 * 番茄短剧站点接入（全局搜索页用）：
 * 搜索结果缓存标题/封面（getArtworkInfo 复用），预览播第一集（走 fqvideo:// 缓存）。
 * 完整功能（书架/连播/进度）在 views/site/fanqie.vue。
 */

// 搜索结果内存缓存：bookId → 搜索条目（getArtworkInfo 提供标题/封面/集数）
const searchHitCache = new Map()

export default {
  /** 搜索短剧：返回 bookId（seriesId）数组；page 从 1 起，每页 20 条 */
  async searchArtworks(keyword, page = 1) {
    const offset = (Math.max(1, Number(page)) - 1) * 20
    const list = await window.fanqie.search(keyword, offset)
    for (const item of list) {
      searchHitCache.set(item.bookId, item)
    }
    return list.map((item) => item.bookId)
  },

  /** 详情：标题（video_detail）+ 剧集数（all_items）；封面取搜索缓存 */
  async getArtworkInfo(bookId) {
    const series = await window.fanqie.getSeries(bookId)
    const hit = searchHitCache.get(bookId)
    return {
      artworkId: bookId,
      title: series.title,
      author: hit?.subtitle || '番茄短剧',
      abstract: hit?.abstract || '',
      cover: hit?.coverUrl || '',
      pages: series.episodes.length,
      artworkType: '视频',
      url: bookId,
      imageUrls: [bookId]
    }
  },

  /** 预览播放：缓存并播放第一集，返回 fqvideo:// 地址（preview-dialog 直接 <video> 播放） */
  async previewImage(url) {
    const bookId = String(url || '')
    const series = await window.fanqie.getSeries(bookId)
    if (!series.episodes.length) throw new Error('未获取到剧集列表')
    const first = series.episodes[0]
    const result = await window.fanqie.ensureEpisode(bookId, first.videoId, 0)
    return result.url
  }
}

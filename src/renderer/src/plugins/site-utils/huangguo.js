import { queue } from '@renderer/plugins/store/downloadQueue'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'

const SITE_ORIGIN = 'https://huangguo.video'

/**
 * 判断当前 URL 是否为视频详情页（https://huangguo.video/video/<slug>）
 * 返回 slug（URL 最后一段）作为下载命名标识
 */
function extractVideoSlug(currentUrl) {
  try {
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    if (!parts.includes('video')) return null
    const slug = parts[parts.length - 1]
    return slug && slug !== 'video' ? slug : null
  } catch {
    return null
  }
}

const siteView = {
  url: `${SITE_ORIGIN}/`,
  updateStatus(currentUrl) {
    const slug = extractVideoSlug(currentUrl)
    return {
      canDownload: !!slug,
      canAttention: false,
      extra: {
        slug,
        pageUrl: currentUrl
      }
    }
  },
  async download({ extra, getCurrentUrl, tip }) {
    const pageUrl = (getCurrentUrl && getCurrentUrl()) || extra?.pageUrl || ''
    const slug = extra?.slug
    if (!pageUrl) {
      tip.error('未获取到当前页面地址')
      return
    }

    tip.info('正在解析视频地址...')
    // 从视频页 HTML 中提取真实内容 ID 与 master.m3u8 地址
    const info = await window.huangguo.getVideoInfo(pageUrl)
    if (!info || !info.success || !info.m3u8Url) {
      tip.error(info?.error || '未解析到视频地址，请进入视频详情页后再下载')
      return
    }

    tip.info('正在准备下载...')
    let baseDir
    try {
      baseDir = await getDefaultDownloadPath('defaultDownloadPath')
    } catch (e) {
      tip.error('未选择下载路径')
      return
    }

    // 使用页面 <h1 class="gallery-title"> 标题作为文件名，缺失时回退到 slug
    const title = info.title || (slug ? `huangguo_${slug}` : `huangguo_${Date.now()}`)
    queue.addTask({
      site: 'huangguo',
      title,
      type: 'video',
      payload: {
        m3u8Url: info.m3u8Url,
        title,
        baseDir: `${baseDir}\\huangguo`,
        quality: '1080p',
        siteUrl: pageUrl
      }
    })
    tip.success('已加入下载队列')
  }
}

export default {
  siteView
}

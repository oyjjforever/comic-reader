import { queue } from '@renderer/plugins/store/downloadQueue'
import { getDefaultDownloadPath } from '@renderer/plugins/site-utils/utils.js'

const SITE_ORIGIN = 'https://huangguoai.com'

/**
 * 判断当前 URL 是否为可下载页面
 * 视频页：https://huangguoai.com/video/<id>/ 或 /video/<id>/ep-<n>/
 * 详情页：https://huangguoai.com/detail/<id>/
 * 返回 { type, videoId }
 */
function extractPageInfo(currentUrl) {
  try {
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const vIdx = parts.indexOf('video')
    if (vIdx !== -1 && parts[vIdx + 1]) {
      return { type: 'video', videoId: parts[vIdx + 1] }
    }
    const dIdx = parts.indexOf('detail')
    if (dIdx !== -1 && parts[dIdx + 1]) {
      return { type: 'detail', videoId: parts[dIdx + 1] }
    }
    return null
  } catch {
    return null
  }
}

const siteView = {
  url: `${SITE_ORIGIN}/`,
  updateStatus(currentUrl) {
    const info = extractPageInfo(currentUrl)
    return {
      canDownload: !!info,
      canAttention: false,
      extra: {
        pageInfo: info,
        pageUrl: currentUrl
      }
    }
  },
  async download({ extra, getCurrentUrl, tip }) {
    const pageUrl = (getCurrentUrl && getCurrentUrl()) || extra?.pageUrl || ''
    if (!pageUrl) {
      tip.error('未获取到当前页面地址')
      return
    }

    tip.info('正在解析视频地址...')
    // 视频页：解析 videoInitialData；详情页：解析 data-ep-grid 选集网格
    const info = await window.huangguo.getVideoInfo(pageUrl.replaceAll('video', 'detail'))
    if (!info || !info.success || !info.contentId) {
      tip.error(info?.error || '未解析到视频信息，请进入视频/详情页后再下载')
      return
    }

    tip.info('正在准备下载...')
    let baseDir
    try {
      baseDir = await getDefaultDownloadPath('downloadPathHuangguo')
    } catch (e) {
      tip.error('未选择下载路径')
      return
    }

    // 标题作为父文件夹，缺失时回退到视频 ID
    const baseTitle = info.title || `huangguo_${info.contentId}`
    const episodes =
      Array.isArray(info.episodes) && info.episodes.length > 0
        ? info.episodes
        : [{ ep: '1', url: info.m3u8Url }]

    // 下载目录：<下载路径>/<标题>，文件命名：第n集.mp4（n 从 1 开始）
    const workDir = `${baseDir}\\${window.file.simpleSanitize(baseTitle)}`

    // 加入队列前先判断是否已下载，跳过已存在的集数
    const pendingEpisodes = episodes.filter(({ ep }) => {
      const epNum = Number(ep) || 1
      const savePath = `${workDir}\\${window.file.simpleSanitize(`第${epNum}集`)}.mp4`
      return !window.file.pathExists(savePath)
    })
    const skippedCount = episodes.length - pendingEpisodes.length
    if (skippedCount > 0) {
      tip.info(`已跳过 ${skippedCount} 个已下载的集数`)
    }
    if (pendingEpisodes.length === 0) {
      tip.success('所有集数均已下载，无需重复下载')
      return
    }

    pendingEpisodes.forEach(({ ep, url }) => {
      const epNum = Number(ep) || 1
      queue.addTask({
        site: 'huangguo',
        title: episodes.length > 1 ? `${baseTitle} 第${epNum}集` : baseTitle,
        type: 'video',
        payload: {
          m3u8Url: url || '',
          videoId: info.contentId,
          ep: epNum,
          fileName: `第${epNum}集`,
          title: baseTitle,
          baseDir: workDir,
          quality: '1080p',
          siteUrl: pageUrl
        }
      })
    })
    tip.success(
      skippedCount > 0
        ? `已加入下载队列（${pendingEpisodes.length} 集，跳过 ${skippedCount} 集）`
        : pendingEpisodes.length > 1
          ? `已加入下载队列（共 ${pendingEpisodes.length} 集）`
          : '已加入下载队列'
    )
  }
}

export default {
  siteView
}

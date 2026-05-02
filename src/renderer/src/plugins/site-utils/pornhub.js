import { queue } from '@renderer/plugins/store/downloadQueue'

export const siteView = {
  url: 'https://cn.pornhub.com/',
  updateStatus(currentUrl) {
    const canDownload = currentUrl.includes('view_video.php') && currentUrl.includes('viewkey=')
    return { canDownload, canAttention: false, extra: {} }
  },
  async download({ getCurrentUrl, tip }) {
    const currentUrl = getCurrentUrl()
    // Extract viewkey from URL
    const urlParams = new URLSearchParams(currentUrl.split('?')[1])
    const viewkey = urlParams.get('viewkey')
    if (!viewkey) throw new Error('无法获取视频viewkey')

    // Add to download queue
    queue.addTask({
      site: 'pornhub',
      title: `PornHub Video - ${viewkey}`,
      url: currentUrl,
      type: 'video',
      payload: {
        url: currentUrl,
        viewkey: viewkey
      }
    })

    tip.success('已添加到下载队列')
  }
  // pornhub 不支持特别关注，不提供 addSpecialAttention
}

export default {
  siteView
}

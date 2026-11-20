import { ref, watch, type Ref } from 'vue'
import type { ThumbPanelItem } from '@renderer/components/thumbnail-panel.vue'

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.avif']
const VIDEO_EXTS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.ogg', '.ogv']

const extOf = (p: string) => {
  const i = p.lastIndexOf('.')
  return i === -1 ? '' : p.toLowerCase().slice(i)
}

/** 视频截帧生成缩略图（与 unified-media-card 相同策略：第 5 秒 + 封面缓存） */
const captureVideoThumb = (path: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = `file://${path}`
    video.muted = true
    video.crossOrigin = 'anonymous'
    const timer = setTimeout(() => reject(new Error('截帧超时')), 15000)
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(5, Math.max(0, (video.duration || 5) - 0.1))
    })
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx && ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        clearTimeout(timer)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch (e) {
        clearTimeout(timer)
        reject(e)
      }
    })
    video.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('视频加载失败'))
    })
  })
}

/**
 * 阅读器缩略图数据源（供 thumbnail-panel 消费）：目录文件清单 + 缩略图解析。
 * - load 幂等（已有清单/加载中/无目录时跳过），在面板首次展开时调用即可
 * - resolve 由 panel 的懒加载机制按需调用：图片直读；视频优先封面缓存，未命中截帧并写缓存
 * - 目录变化自动清空清单，下次展开重新读取
 */
export function useFolderThumbSource(folderPath: Ref<string | undefined>) {
  const items = ref<ThumbPanelItem[]>([])
  const loading = ref(false)

  const load = async () => {
    const dir = folderPath.value
    if (!dir || loading.value || items.value.length > 0) return
    loading.value = true
    try {
      const files = await window.media.getFiles(dir)
      // 读取期间已切换作品：丢弃过期清单（否则旧文件会漏进新作品的面板）
      if (folderPath.value !== dir) return
      items.value = files.map((f) => {
        const ext = extOf(f.fullPath)
        return {
          key: f.fullPath,
          name: f.name,
          ext,
          isVideo: VIDEO_EXTS.includes(ext)
        }
      })
    } finally {
      loading.value = false
    }
  }

  const resolve = async (item: ThumbPanelItem): Promise<string> => {
    const ext = extOf(item.key)
    if (IMAGE_EXTS.includes(ext)) return `file://${item.key}`
    if (!VIDEO_EXTS.includes(ext)) return ''
    const cached = await window.videoCover.get(item.key)
    if (cached) return `file://${cached}`
    const dataUrl = await captureVideoThumb(item.key)
    window.videoCover.saveFromDataUrl(item.key, dataUrl).catch(() => undefined)
    return dataUrl
  }

  watch(folderPath, () => {
    items.value = []
  })

  return { items, loading, load, resolve }
}

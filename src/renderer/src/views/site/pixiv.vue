<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts" name="pixiv">
import { ref, onMounted } from 'vue'
import { getDefaultDownloadPath, Tip } from './utils'
import { queue } from '@renderer/plugins/store/downloadQueue'
const { pixiv, file } = window as any
const url = ref('https://www.pixiv.net/')
const webviewRef = ref<any>(null)
const canDownload = ref(false)
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    canDownload.value =
      !!currentUrl && (currentUrl.includes('illustrations') || currentUrl.includes('artworks'))
  } catch {
    canDownload.value = false
  }
}
// 解析作者ID：从 https://www.pixiv.net/users/113801960/illustrations 中提取 113801960
function extractUserId(currentUrl: string): string | null {
  try {
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p === 'users')
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
    return null
  } catch {
    return null
  }
}
// 解析作品ID：从 https://www.pixiv.net/artworks/135869669#1 中提取 135869669
function extractArtworkId(currentUrl: string): string | null {
  try {
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p === 'artworks')
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
    return null
  } catch {
    return null
  }
}
async function download() {
  const tip = new Tip()
  try {
    const wv = webviewRef.value
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    let illusts: string[] = []
    // 单作品
    if (currentUrl.includes('artworks')) {
      const artworkId = extractArtworkId(currentUrl)
      if (artworkId) illusts = [artworkId]
    }
    // 作品集
    else if (currentUrl.includes('illustrations')) {
      const userId = extractUserId(currentUrl)
      if (!userId) throw new Error('无法从当前URL解析 未解析到作者ID')
      const profile = await pixiv.getArtworksByUserId(userId)
      illusts = Object.keys(profile.illusts || {}).reverse()
    }
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathPixiv')
    // 每个作品加入队列任务
    for (const artworkId of illusts) {
      queue.addTask({
        site: 'pixiv',
        title: `作品 ${artworkId}`,
        payload: {
          artworkId,
          baseDir: defaultDownloadPath
        }
      })
    }
  } catch (error) {
    tip.error(error)
  }
}

onMounted(async () => {
  const wv = webviewRef.value
  if (!wv) return
  updateCanDownload()
  // 监听导航事件以动态更新可下载状态
  wv.addEventListener('did-navigate', updateCanDownload)
  wv.addEventListener('did-navigate-in-page', updateCanDownload)
  wv.addEventListener('dom-ready', updateCanDownload)
})

// 暴露方法
defineExpose({
  download,
  canDownload
})
</script>

<style lang="scss">
.site {
  padding: 10px;
  height: 100%;
  webview {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
  }
}
</style>

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
const canAttention = ref(false)
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    canDownload.value =
      !!currentUrl && (currentUrl.includes('illustrations') || currentUrl.includes('artworks'))
    canAttention.value = !!currentUrl && currentUrl.includes('users')
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
async function addSpecialAttention() {
  const tip = new Tip()
  try {
    const wv = webviewRef.value
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const userId = extractUserId(currentUrl)
    const firstArtworkId = (await pixiv.getArtworksByUserId(userId)).illusts[0]
    const authorName = (await pixiv.getArtworkInfo(firstArtworkId)).author
    await window.specialAttention.add({
      source: 'pixiv',
      authorId: userId,
      authorName
    })
    tip.success('已添加到特别关注')
  } catch (e) {
    tip.error(e)
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
      illusts = profile.illusts
    }
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathPixiv')
    // 每个作品加入队列任务
    for (const artworkId of illusts) {
      const artworkInfo = await pixiv.getArtworkInfo(artworkId)
      queue.addTask({
        site: 'pixiv',
        title: `[${artworkInfo.author}]${artworkInfo.title}`,
        payload: {
          artworkId,
          artworkInfo,
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
  canDownload,
  canAttention,
  addSpecialAttention
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

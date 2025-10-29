<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
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
let downloadType
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    canDownload.value = true
    if (currentUrl.includes('artworks')) {
      downloadType = 'artwork'
    } else if (currentUrl.includes('illustrations')) {
      downloadType = 'illusts'
    } else if (currentUrl.includes('series')) {
      downloadType = 'managa'
    } else {
      canDownload.value = false
    }
    canAttention.value = !!currentUrl && currentUrl.includes('users')
  } catch {
    canDownload.value = false
    canAttention.value = false
  }
}
function extractFromUrl(key) {
  try {
    const wv = webviewRef.value
    if (!wv) return null
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p === key)
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
    return null
  } catch {
    return null
  }
}
async function addSpecialAttention() {
  const tip = new Tip()
  try {
    const userId = extractFromUrl('users')
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
    let artworkIds: string[] = []
    // 单作品
    if (downloadType === 'artwork') {
      const artworkId = extractFromUrl('artworks')
      if (artworkId) artworkIds = [artworkId]
    }
    // 插画集
    else if (downloadType === 'illusts') {
      const userId = extractFromUrl('users')
      if (!userId) throw new Error('无法从当前URL解析 未解析到作者ID')
      const profile = await pixiv.getArtworksByUserId(userId)
      artworkIds = profile.illusts
    }
    // 漫画集
    else if (downloadType === 'managa') {
      const mangaId = extractFromUrl('series')
      const mangaInfo = await pixiv.getMangaInfo(mangaId)
      artworkIds = mangaInfo.series
    }
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathPixiv')
    // 每个作品加入队列任务
    for (const artworkId of artworkIds) {
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

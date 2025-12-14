<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
  </div>
</template>

<script setup lang="ts" name="pixiv">
import { ref, onMounted } from 'vue'
import { Tip } from './utils'
const { pixiv } = window as any
import pixivUtil from '@renderer/views/special-attention/pixiv.js'
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
    const parts = currentUrl.split('/').filter(Boolean)
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
    // 单作品
    if (downloadType === 'artwork') {
      const artworkId = extractFromUrl('artworks')
      if (!artworkId) throw new Error('未获取到作品ID')
      await pixivUtil.downloadArtwork(artworkId)
    }
    // 插画集
    else if (downloadType === 'illusts') {
      const userId = extractFromUrl('users')
      if (!userId) throw new Error('未获取到用户ID')
      await pixivUtil.downloadIllusts(userId)
    }
    // 漫画集
    else if (downloadType === 'managa') {
      const mangaId = extractFromUrl('series')
      if (!mangaId) throw new Error('未获取到漫画ID')
      await pixivUtil.downloadManga(mangaId)
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

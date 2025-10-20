<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts" name="pixiv">
import { ref, onMounted } from 'vue'
import { getDefaultDownloadPath, Tip } from './utils'
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
    let illusts = []
    // 如果是单作品下载
    if (currentUrl.includes('artworks')) {
      const artworkId = extractArtworkId(currentUrl)
      illusts = [artworkId]
    }
    // 如果是作品集下载
    else if (currentUrl.includes('illustrations')) {
      const userId = extractUserId(currentUrl)
      if (!userId) throw new Error('无法从当前URL解析 未解析到作者ID')
      const profile = await pixiv.getArtworksByUserId(userId)
      illusts = Object.keys(profile.illusts || {}).reverse()
    }
    tip.info(`共${illusts.length}篇作品，开始下载...`)
    let defaultDownloadPath = await getDefaultDownloadPath('downloadPathPixiv')
    // 作品逐个下载
    for (let currentArtwork = 0; currentArtwork < illusts.length; currentArtwork++) {
      const artworkId = illusts[currentArtwork]
      const artworkInfo = await pixiv.getArtworkInfo(artworkId)
      const images: string[] = await pixiv.getArtworkImages(artworkId)
      // 作品中的图片逐页下载
      for (let curentImage = 0; curentImage < images.length; curentImage++) {
        const url = images[curentImage]
        const fileName = `${curentImage.toString().padStart(5, '0')}.${url.split('.').pop() || 'jpg'}`
        const baseDir = `${defaultDownloadPath}/${artworkInfo.author}/${file.simpleSanitize(artworkInfo.title)}`
        const savePath = `${baseDir}/${fileName}`
        try {
          await pixiv.downloadImage(url, savePath)
        } finally {
          tip.progress({
            title: artworkInfo.title,
            chapter: {
              index: currentArtwork + 1,
              total: illusts.length
            },
            image: {
              index: curentImage + 1,
              total: images.length
            }
          })
        }
      }
    }
    tip.success()
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

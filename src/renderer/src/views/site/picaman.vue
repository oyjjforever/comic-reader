<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
  </div>
</template>

<script setup lang="ts" name="picaman">
import { ref, onMounted } from 'vue'
import { getDefaultDownloadPath } from './utils'
import picamanUtil from '@renderer/views/special-attention/picaman.js'
const url = ref('https://www.wnacg.com/')

const webviewRef = ref<any>(null)
const canDownload = ref(false)
const comicId = ref<string | null>(null)

function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    // 匹配漫画详情页，如 /photos-index-aid-12345.html 或 /photos-slide-aid-12345.html
    const match = currentUrl.match(/photos-(?:index|slide)-aid-(\d+)/)
    if (match) {
      comicId.value = match ? match[1] : null
      canDownload.value = true
    } else {
      comicId.value = null
      canDownload.value = false
    }
  } catch {
    comicId.value = null
    canDownload.value = false
  }
}

async function download() {
  if (comicId.value) {
    await picamanUtil.downloadArtwork(null, comicId.value)
  }
}

onMounted(() => {
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
  width: 100%;
  webview {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
  }
}
</style>

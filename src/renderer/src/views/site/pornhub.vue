<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
  </div>
</template>

<script setup lang="ts" name="pornhub">
import { ref, onMounted, defineExpose } from 'vue'
import { Tip } from './utils'
import { queue } from '../../plugins/store/downloadQueue.js'
const url = ref('https://cn.pornhub.com/')
const webviewRef = ref<any>(null)
const canDownload = ref(false)
const canAttention = ref(false)
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    canDownload.value = false

    // Check if URL matches the Pornhub video format
    if (currentUrl.includes('view_video.php') && currentUrl.includes('viewkey=')) {
      canDownload.value = true
    }

    canAttention.value = false // Pornhub doesn't have user attention feature like Pixiv
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
  // Pornhub doesn't support special attention feature
  const tip = new Tip()
  tip.info('PornHub不支持特别关注功能')
}
async function download() {
  const tip = new Tip()
  try {
    const wv = webviewRef.value
    if (!wv) throw new Error('无法获取webview实例')
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src

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
  } catch (error) {
    tip.error(error.message || error)
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

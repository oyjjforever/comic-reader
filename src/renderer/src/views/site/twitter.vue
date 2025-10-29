<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
  </div>
</template>

<script setup lang="ts" name="twitter">
import { ref, onMounted, defineExpose } from 'vue'
import { getDefaultDownloadPath, Tip } from './utils'
import { queue } from '@renderer/plugins/store/downloadQueue'
const { twitter, file } = window as any
const url = ref('https://x.com/')
const webviewRef = ref<any>(null)
const canDownload = ref(false)
const canAttention = ref(false)
let downloadType
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const author = extractFromUrl('x.com')
    canDownload.value = true
    if (currentUrl.includes('status')) {
      downloadType = 'video'
    } else if (author !== 'home') {
      downloadType = 'media'
    } else {
      canDownload.value = false
    }
    canAttention.value = author !== 'home'
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
async function download() {
  const tip = new Tip()
  try {
    const author = extractFromUrl('x.com')
    if (!author) throw new Error('无法从当前URL解析 screen_name')
    const userId = await twitter.getUserIdByName(author)
    if (!userId) throw new Error('未获取到用户ID')
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathTwitter')
    if (downloadType === 'media') {
      // 将媒体页作为一个任务加入队列
      queue.addTask({
        site: 'twitter',
        title: `[${author}]的媒体库`,
        payload: {
          author,
          userId,
          baseDir: defaultDownloadPath
        }
      })
    } else if (downloadType === 'video') {
      const twitterId = extractFromUrl('status')
      const videoUrls = await window.twitter.getVideoUrls(twitterId)
      queue.addTask({
        site: 'twitter',
        title: `[${author}]的视频(${twitterId})`,
        payload: {
          author,
          twitterId,
          videoUrl: videoUrls.pop().url,
          baseDir: defaultDownloadPath
        }
      })
    }
  } catch (error) {
    tip.error(error)
  }
}
async function addSpecialAttention() {
  const tip = new Tip()
  try {
    const author = extractFromUrl('x.com')
    const userId = await twitter.getUserIdByName(author)
    await window.specialAttention.add({
      source: 'twitter',
      authorId: userId,
      authorName: author
    })
    tip.success('已添加到特别关注')
  } catch (e) {
    tip.error(e)
  }
}
onMounted(async () => {
  const wv = webviewRef.value
  if (!wv) return
  updateCanDownload()
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

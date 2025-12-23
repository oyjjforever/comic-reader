<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
  </div>
</template>

<script setup lang="ts" name="weibo">
import { ref, onMounted, defineExpose } from 'vue'
import { Tip } from './utils'
const { weibo } = window as any
import weiboUtil from '@renderer/views/special-attention/weibo.js'
const url = ref('https://weibo.com/')
const webviewRef = ref<any>(null)
const canDownload = ref(false)
const canAttention = ref(false)
let downloadType
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const authorId = extractFromUrl('u')
    const authorName = extractFromUrl('n')
    canDownload.value = !!authorId || !!authorName
    canAttention.value = !!authorId || !!authorName
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
    if (idx !== -1 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1])
    return null
  } catch {
    return null
  }
}
async function download() {
  const tip = new Tip()
  try {
    let authorId = extractFromUrl('u')
    let authorName = extractFromUrl('n')
    if (authorId && !authorName) authorName = await weibo.getAuthorNameById(authorId)
    if (authorName && !authorId) authorId = await weibo.getAuthorIdByName(authorName)
    await weiboUtil.downloadAllMedia(authorName, authorId)
  } catch (error) {
    tip.error(error)
  }
}
async function addSpecialAttention() {
  const tip = new Tip()
  try {
    let authorId = extractFromUrl('u')
    let authorName = extractFromUrl('n')
    if (authorId && !authorName) authorName = await weibo.getAuthorNameById(authorId)
    if (authorName && !authorId) authorId = await weibo.getAuthorIdByName(authorName)
    await window.specialAttention.add({
      source: 'weibo',
      authorId,
      authorName
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

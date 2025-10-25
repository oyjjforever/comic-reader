<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
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
function updateCanDownload() {
  try {
    const author = getAuthorFromUrl()
    canDownload.value = author !== 'home'
    canAttention.value = author !== 'home'
  } catch {
    canDownload.value = false
  }
}

/**
 * 从与 temp.json 同结构的对象中提取所有 cursorType === "Bottom" 的 value 值
 * @param root 任意对象（如 JSON.parse(temp.json) 的结果）
 * @returns 去重后的 value 列表
 */

function getAuthorFromUrl(): string | null {
  try {
    const wv = webviewRef.value
    if (!wv) throw new Error('webview 未准备好')
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    return currentUrl.match(/x\.com\/([^\/]+)/)?.[1]
  } catch {
    return null
  }
}
async function download() {
  const tip = new Tip()
  try {
    const wv = webviewRef.value
    if (!wv) throw new Error('webview 未准备好')
    const author = getAuthorFromUrl()
    if (!author) throw new Error('无法从当前URL解析 screen_name')
    const userId = await twitter.getUserIdByName(author)
    if (!userId) throw new Error('未获取到用户ID')
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathTwitter')
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
  } catch (error) {
    tip.error(error)
  }
}
async function addSpecialAttention() {
  const tip = new Tip()
  try {
    const author = getAuthorFromUrl()
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

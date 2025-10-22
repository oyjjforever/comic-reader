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
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    canDownload.value = !!currentUrl && currentUrl.includes('media')
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
    // 形如 https://x.com/<screen_name>/media
    const parts = currentUrl.split('/').filter(Boolean)
    // parts[0] 是 screen_name；当第二段是 'media' 时有效
    if (parts.length >= 1) return parts[0]
    return null
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
    const cookies = await wv.executeJavaScript(`(async () => {
      try {
        return document.cookie || '';
      } catch (e) {
        return '';
      }
    })()`)
    tip.info('正在获取作品分页...')
    const userId = await twitter.getUserIdByName(author, cookies)
    if (!userId) throw new Error('未获取到用户ID')
    const defaultDownloadPath = await getDefaultDownloadPath('downloadPathTwitter')
    // 将媒体页作为一个任务加入队列
    queue.addTask({
      site: 'twitter',
      title: author,
      payload: {
        author,
        userId,
        cookies,
        baseDir: `${defaultDownloadPath}/${file.simpleSanitize(author)}`
      }
    })
  } catch (error) {
    tip.error(error)
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

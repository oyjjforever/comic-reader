<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
  </div>
</template>

<script setup lang="ts" name="jmtt">
import { ref, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
const message = useMessage()
import { getDefaultDownloadPath, Tip } from './utils'
const { jmtt, file } = window as any
import jmttUtil from '@renderer/views/special-attention/jmtt.js'
const url = ref('https://jmcomic-zzz.one/')

const webviewRef = ref<any>(null)
const canDownload = ref(false)
const canAttention = ref(false)
let downloadType
const comicId = ref<string | null>(null)
const searchQuery = ref<string | null>(null)

function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const match = currentUrl.match(/\/album\/(\d+)/)
    if (match) {
      comicId.value = match ? match[1] : null
      canDownload.value = true
      downloadType = 'one'
    }
    if (currentUrl.includes('main_tag=2')) {
      downloadType = 'batch'
      canAttention.value = true
      canDownload.value = true
      const urlObj = new URL(currentUrl)
      searchQuery.value = decodeURIComponent(urlObj.searchParams.get('search_query'))
    }
  } catch {
    comicId.value = null
    canDownload.value = false
    canAttention.value = false
  }
}
async function addSpecialAttention() {
  const tip = new Tip()
  try {
    await window.specialAttention.add({
      source: 'jmtt',
      authorId: searchQuery.value,
      authorName: searchQuery.value
    })
    tip.success('已添加到特别关注')
  } catch (e) {
    tip.error(e)
  }
}
async function download() {
  if (downloadType === 'one') {
    await jmttUtil.downloadArtwork(null, comicId.value)
  } else if (downloadType === 'batch') {
    await jmttUtil.downloadAll(searchQuery.value)
  }
}
const onDownloadPrepare = async (event: any, data: any) => {
  let defaultDownloadPath = await getDefaultDownloadPath('downloadPathJmtt')
  // 获取文件名称
  const wv = webviewRef.value
  if (!wv) return
  const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
  const match = currentUrl.match(/\/album_download\/(\d+)/)
  const comicId = match ? match[1] : null
  const comicInfo = await jmtt.getComicInfo(comicId)
  try {
    await window.electron.ipcRenderer.invoke('download:start', {
      fileName: `${file.simpleSanitize(comicInfo.name)}.zip`,
      url: data.url,
      savePath: `${defaultDownloadPath}/${comicInfo.author[0] || '未分类'}`,
      autoExtract: true
    })
    message.success(`下载完成`)
  } catch (e: any) {
    message.error(`下载失败：${e?.message || e}`)
  }
}
onMounted(() => {
  const wv = webviewRef.value
  if (!wv) return
  updateCanDownload()
  window.electron.ipcRenderer.on('download:prepare', onDownloadPrepare)
  // 监听导航事件以动态更新可下载状态
  wv.addEventListener('did-navigate', updateCanDownload)
  wv.addEventListener('did-navigate-in-page', updateCanDownload)
  wv.addEventListener('dom-ready', updateCanDownload)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('download:prepare', onDownloadPrepare)
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

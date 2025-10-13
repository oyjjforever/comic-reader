<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts" name="jmtt">
import { ref, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingStore } from '@renderer/plugins/store'
const message = useMessage()
const settingStore = useSettingStore()

const url = ref('https://jmcomic-zzz.one/')
const webviewRef = ref<any>(null)
let canDownload = false
let comicId = null
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const match = currentUrl.match(/\/album\/(\d+)/)
    if (match) {
      comicId = match[1]
    }
    canDownload = !!match
  } catch {
    canDownload = false
  }
}
async function download() {
  let defaultDownloadPath =
    settingStore.setting?.downloadPathJmtt || settingStore.setting?.defaultDownloadPath
  if (!defaultDownloadPath) {
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      defaultDownloadPath = result.filePaths[0]
    }
  }
  if (!defaultDownloadPath) {
    message.error('未选择下载路径')
    return
  }
  await window.jmDownloader.download(defaultDownloadPath, comicId)
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
onUnmounted(() => {})
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

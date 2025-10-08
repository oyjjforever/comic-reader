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
const onDownloadPrepare = async (event: any, data: any) => {
  // 判断是否存在默认路径（jmtt优先）
  let defaultDownloadPath =
    settingStore.setting?.downloadPathJmtt || settingStore.setting?.defaultDownloadPath
  const ext = data.fileName.split('.').pop()
  if (!defaultDownloadPath) {
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      defaultDownloadPath = result.filePaths[0]
    }
  }
  // 获取文件名称
  const webview = document.querySelector('webview')
  const name = await webview.executeJavaScript(
    'document.querySelector(".panel-heading").children[0].innerText'
  )
  const author = await webview.executeJavaScript(
    'document.querySelector(".web-author-tag").innerText'
  )
  try {
    const result = await window.electron.ipcRenderer.invoke('download:start', {
      fileName: `${name}.${ext}`,
      url: data.url,
      savePath: `${defaultDownloadPath}/${author || '未分类'}`,
      autoExtract: true
    })
    message.success(`下载完成`)
  } catch (e: any) {
    message.error(`下载失败：${e?.message || e}`)
  }
}
onMounted(() => {
  window.electron.ipcRenderer.on('download:prepare', onDownloadPrepare)
})
onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('download:prepare', onDownloadPrepare)
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

<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts">
import { useMessage } from 'naive-ui'
const message = useMessage()

const url = ref('https://jmcomic-zzz.one/')
const webviewRef = ref<any>(null)

const onDownloadPrepare = async (event: any, data: any) => {
  // 判断是否存在默认路径
  let savePath = settingStore.setting?.defaultDownloadPath
  const ext = data.fileName.split('.').pop()
  if (!savePath) {
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      savePath = result.filePaths[0]
    }
  }
  // 获取文件名称
  const webview = document.querySelector('webview')
  const name = await webview.executeJavaScript(
    'document.querySelector(".panel-heading").children[0].innerText'
  )
  window.electron.ipcRenderer.send('download:start', {
    fileName: `${name}.${ext}`,
    url: data.url,
    savePath
  })
}
const onDownloadFailed = (event: any, data: any) => {
  message.error(`下载失败：${data.message}`)
}
const onDownloadCompleted = (event: any, data: any) => {
  message.success(`下载完成：${data.savePath}`)
}
onMounted(async () => {
  window.electron.ipcRenderer.on('download:prepare', onDownloadPrepare)
  window.electron.ipcRenderer.on('download:failed', onDownloadFailed)
  window.electron.ipcRenderer.on('download:completed', onDownloadCompleted)
})
</script>

<style lang="scss">
.site {
  padding: 10px;
  height: calc(100% - 24px);
  webview {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
  }
}
</style>

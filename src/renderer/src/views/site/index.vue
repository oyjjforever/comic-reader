<template>
  <div class="site">
    <n-form :model="form" inline>
      <n-button @click="onBack"
        ><template #icon>
          <n-icon><ArrowLeft24Filled /></n-icon> </template
      ></n-button>
      <n-button @click="onForward"
        ><template #icon>
          <n-icon><ArrowRight24Filled /></n-icon> </template
      ></n-button>
      <n-button @click="onRefresh"
        ><template #icon>
          <n-icon><ArrowClockwise24Filled /></n-icon> </template
      ></n-button>
      <n-input
        style="margin: 0 10px"
        v-model:value="form.url"
        placeholder="输入要加载的第三方网页地址，例如：https://example.com"
      />
      <n-button type="primary" @click="loadUrl">加载</n-button>
    </n-form>

    <div class="webview-wrap">
      <webview
        ref="webviewRef"
        :src="url"
        partition="persist:thirdparty"
        style="width: 100%; height: calc(100vh - 100px); background: #fff"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingStore } from '@renderer/plugins/store'
import { ArrowLeft24Filled, ArrowRight24Filled, ArrowClockwise24Filled } from '@vicons/fluent'
const settingStore = useSettingStore()
const message = useMessage()

const form = reactive({
  url: ''
})
const url = ref('')
const webviewRef = ref<any>(null)

const loadUrl = () => {
  if (!form.url) {
    message.warning('请输入网页地址')
    return
  }
  url.value = form.url
  // 持久化网页地址
  settingStore.setSetting({ ...settingStore.setting, thirdPartyUrl: form.url })
  if (webviewRef.value?.loadURL) {
    webviewRef.value.loadURL(form.url)
  }
}
const onBack = () => {
  webviewRef.value?.goBack()
}
const onForward = () => {
  webviewRef.value?.goForward()
}
const onRefresh = () => {
  webviewRef.value?.reload()
}
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
  await webview.executeJavaScript(
    'document.title =document.querySelector(".panel-heading").children[0].innerText'
  )
  const title = webview.getTitle()
  window.electron.ipcRenderer.send('download:start', {
    fileName: `${title}.${ext}`,
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
  await settingStore.updateSetting()
  url.value = form.url = settingStore.setting?.thirdPartyUrl
  window.electron.ipcRenderer.on('download:prepare', onDownloadPrepare)
  window.electron.ipcRenderer.on('download:failed', onDownloadFailed)
  window.electron.ipcRenderer.on('download:completed', onDownloadCompleted)
})
</script>

<style scoped>
.site {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.webview-wrap {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  overflow: hidden;
  flex: 1;
}
</style>

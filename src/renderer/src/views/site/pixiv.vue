<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingStore } from '@renderer/plugins/store'

const settingStore = useSettingStore()
const message = useMessage()

// 通过 preload 暴露的 ipcRenderer（若你的 preload 暴露为 window.electron.ipcRenderer，请按需替换）
const { ipcRenderer } = (window as any).electron || require('electron')

const url = ref('https://www.pixiv.net/')
const webviewRef = ref<any>(null)

// 解析作品ID：从 https://www.pixiv.net/artworks/135869669#1 中提取 135869669
function extractArtworkId(currentUrl: string): string | null {
  try {
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p === 'artworks')
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
    return null
  } catch {
    return null
  }
}
let msgReactive = null
// 简单进度提示（当前页/总页）
function showPageProgress(current: number, total: number) {
  msgReactive.content = `下载进度：${current} / ${total}`
}

// 主下载方法：按需调用，无需参数，从 webview 当前页面解析
async function download() {
  try {
    const wv = webviewRef.value
    if (!wv) {
      message.error('webview 未准备好')
      return
    }
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const artworkId = extractArtworkId(currentUrl)
    if (!artworkId) {
      message.error('未从当前地址解析到作品ID')
      return
    }

    const api = `https://www.pixiv.net/ajax/illust/${artworkId}/pages?lang=zh`
    const data = await webviewRef.value.executeJavaScript(`(async () => {
      try {
        const res = await fetch('https://www.pixiv.net/ajax/illust/${artworkId}/pages?lang=zh', { credentials: 'include' });
        if (!res.ok) return { error: true, message: 'HTTP ' + res.status, body: [] };
        return await res.json();
      } catch (e) {
        return { error: true, message: String(e), body: [] };
      }
    })()`)
    if (data.error || !Array.isArray(data.body)) {
      message.error(`接口返回异常：\${data?.message || '无内容'}`)
      return
    }
    const pages: Array<{ urls: { original: string } }> = data.body
    const total = pages.length
    if (total === 0) {
      message.warning('无可下载的页')
      return
    }
    msgReactive = message.create(`开始下载，共 ${total} 页`, {
      type: 'loading',
      duration: 0
    })
    let current = 0
    const onCompleted = () => {
      // 单个文件完成后更新页计数并提示
      current += 1
      showPageProgress(current, total)
      if (current === total) {
        msgReactive.type = 'success'
        msgReactive.content = '全部下载成功'
        setTimeout(() => {
          msgReactive?.destroy()
        }, 1000)
        // 清理监听
        ipcRenderer.removeListener('download:completed', onCompleted)
        ipcRenderer.removeListener('download:failed', onFailed)
      }
    }
    const onFailed = (_e: any, info: any) => {
      current += 1
      msgReactive.type = 'error'
      msgReactive.content = `下载失败：${info?.message || '未知错误'}`
      showPageProgress(current, total)
      if (current === total) {
        setTimeout(() => {
          msgReactive?.destroy()
        }, 1000)
        ipcRenderer.removeListener('download:completed', onCompleted)
        ipcRenderer.removeListener('download:failed', onFailed)
      }
    }

    ipcRenderer.on('download:completed', onCompleted)
    ipcRenderer.on('download:failed', onFailed)

    // 保存路径写死为 test（主进程会确保目录存在）
    const webview = document.querySelector('webview')
    const name = await webview.executeJavaScript('document.querySelector("h1").innerText')
    // 判断是否存在默认路径
    let defaultDownloadPath = settingStore.setting?.defaultDownloadPath
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
    // 逐页触发主进程下载
    pages.forEach((page, idx) => {
      const originalUrl = page?.urls?.original
      if (!originalUrl) {
        // 没有 original 时也推进进度
        onFailed(null, { message: `第 ${idx} 页无 original 链接` })
        return
      }
      // 生成文件名：{artworkId}_p{index}.{ext}
      const ext = originalUrl.split('.').pop() || 'jpg'
      const fileName = `${artworkId}_p${idx}.${ext}`

      // 通过主进程下载；主进程会将数据流保存为文件
      ipcRenderer.send('download:start', {
        url: originalUrl,
        fileName,
        savePath: `${defaultDownloadPath}/${name}`,
        autoExtract: false,
        headers: {
          Referer: 'https://www.pixiv.net/'
        }
      })
    })
  } catch (e: any) {
    message.error(`下载异常：${e?.message || e}`)
  }
}

onMounted(async () => {
  // 可在此处做 webview 初始化等
})

// 暴露方法
defineExpose({
  download
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

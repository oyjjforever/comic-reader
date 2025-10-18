<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
  </div>
</template>

<script setup lang="ts" name="pixiv">
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingStore } from '@renderer/plugins/store'

const settingStore = useSettingStore()
const message = useMessage()

// 通过 preload 暴露的 ipcRenderer（若你的 preload 暴露为 window.electron.ipcRenderer，请按需替换）
const { ipcRenderer } = (window as any).electron || require('electron')

const url = ref('https://www.pixiv.net/')
const webviewRef = ref<any>(null)
const canDownload = ref(false)
function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    canDownload.value =
      !!currentUrl && (currentUrl.includes('illustrations') || currentUrl.includes('artworks'))
  } catch {
    canDownload.value = false
  }
}
// 解析作者ID：从 https://www.pixiv.net/users/113801960/illustrations 中提取 113801960
function extractUserId(currentUrl: string): string | null {
  try {
    const u = new URL(currentUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p === 'users')
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
    return null
  } catch {
    return null
  }
}
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
let artworks = { current: 1, total: 1 }
// 简单进度提示（当前页/总页）
function showPageProgress(current: number, total: number) {
  msgReactive.content = `下载进度：第${artworks.current}/${artworks.total}篇：${current} / ${total}`
}
async function download() {
  const wv = webviewRef.value
  if (!wv) {
    message.error('webview 未准备好')
    return
  }
  const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
  if (currentUrl.includes('illustrations')) {
    const userId = extractUserId(currentUrl)
    const data = await wv.executeJavaScript(`(async () => {
      try {
        const res = await fetch('https://www.pixiv.net/ajax/user/${userId}/profile/all?sensitiveFilterMode=userSetting&lang=zh', { credentials: 'include' });
        if (!res.ok) return { error: true, message: 'HTTP ' + res.status, body: [] };
        return await res.json();
      } catch (e) {
        return { error: true, message: String(e), body: [] };
      }
    })()`)
    if (data.error) {
      message.error(`接口返回异常：${data?.message || '无内容'}`)
      return
    }
    const illusts = Object.keys(data.body.illusts).reverse()
    artworks.total = illusts.length
    msgReactive = message.create(`共${illusts.length}篇作品，开始下载...`, {
      type: 'loading',
      duration: 0
    })
    for (let i = 0; i < illusts.length; i++) {
      const artworkId = illusts[i]
      artworks.current = i + 1
      const artworkInfoResponse = await wv.executeJavaScript(`(async () => {
      try {
        const res = await fetch('https://www.pixiv.net/ajax/user/113801960/profile/illusts?ids%5B%5D=${artworkId}&work_category=illust&is_first_page=1&sensitiveFilterMode=userSetting&lang=zh', { credentials: 'include' });
        if (!res.ok) return { error: true, message: 'HTTP ' + res.status, body: [] };
        return await res.json();
      } catch (e) {
        return { error: true, message: String(e), body: [] };
      }
    })()`)
      const artworkInfo = artworkInfoResponse.body.works[artworkId]
      // 只下载图片
      if (artworkInfo.illustType === 0) {
        setTimeout(async () => {
          await downloadArtWork(artworkId, artworkInfo.userName, artworkInfo.title)
        }, Math.random() * 1000)
      }
    }
  } else if (currentUrl.includes('artworks')) {
    const artworkId = extractArtworkId(currentUrl)
    const author = await wv.executeJavaScript('document.querySelector("h2 > div > div").innerText')
    let artworkName = await wv.executeJavaScript('document.querySelector("h1").innerText')
    msgReactive = message.create(`共1篇作品，开始下载...`, {
      type: 'loading',
      duration: 0
    })
    await downloadArtWork(artworkId, author, artworkName)
  }
}
// 主下载方法：按需调用，无需参数，从 webview 当前页面解析
async function downloadArtWork(artworkId: string, author: string, artworkName: string) {
  try {
    if (!artworkId) {
      message.error('未解析到作品ID')
      return
    }

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
      message.error(`接口返回异常：${data?.message || '无内容'}`)
      return
    }
    const pages: Array<{ urls: { original: string } }> = data.body
    const total = pages.length
    if (total === 0) {
      message.warning('无可下载的页')
      return
    }
    let current = 0
    const CONCURRENCY = 4
    // 简易并发池
    async function runPool(
      items: any[],
      worker: (item: any, idx: number) => Promise<any>,
      limit = CONCURRENCY
    ) {
      return new Promise((resolve) => {
        const results: any[] = new Array(items.length)
        let i = 0
        let active = 0
        function next() {
          while (active < limit && i < items.length) {
            const idx = i++
            active++
            Promise.resolve(worker(items[idx], idx))
              .then((val) => {
                results[idx] = val
              })
              .catch((err) => {
                results[idx] = err
              })
              .finally(() => {
                active--
                if (i === items.length && active === 0) resolve(results)
                else next()
              })
          }
        }
        next()
      })
    }

    // 判断是否存在默认路径（pixiv优先）
    let defaultDownloadPath =
      settingStore.setting?.downloadPathPixiv || settingStore.setting?.defaultDownloadPath
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
    // 逐页触发主进程下载：使用 invoke，并发受限执行
    await runPool(
      pages,
      async (page, idx) => {
        const originalUrl = page?.urls?.original
        if (!originalUrl) {
          current += 1
          message.error(`第 ${idx} 页无 original 链接`)
          showPageProgress(current, total)
          return
        }
        const ext = originalUrl.split('.').pop() || 'jpg'
        const fileName = `${idx.toString().padStart(5,'0')}.${ext}`
        try {
          await ipcRenderer.invoke('download:start', {
            url: originalUrl,
            fileName,
            savePath: `${defaultDownloadPath}/${author || '未分类'}/${artworkName}`,
            autoExtract: false,
            headers: { Referer: 'https://www.pixiv.net/' }
          })
          current += 1
          showPageProgress(current, total)
        } catch (e: any) {
          current += 1
          message.error(`下载失败：${e?.message || '未知错误'}`)
          showPageProgress(current, total)
        }
      },
      CONCURRENCY
    )
    if (current === total && artworks.current === artworks.total) {
      msgReactive?.destroy()
      message.success('全部下载成功')
    }
  } catch (e: any) {
    message.error(`下载异常：${e?.message || e}`)
  }
}

onMounted(async () => {
  const wv = webviewRef.value
  if (!wv) return
  updateCanDownload()
  // 监听导航事件以动态更新可下载状态
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

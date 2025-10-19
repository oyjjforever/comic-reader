<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" />
    <NModal
      v-model:show="showChapterDialog"
      preset="card"
      title="选择章节"
      style="max-width: 640px; width: 90%"
    >
      <NScrollbar style="max-height: 50vh; width: 100%">
        <NCheckboxGroup
          v-model:value="selected"
          style="display: grid; grid-template-columns: repeat(6, 100px)"
        >
          <template v-for="c in comicInfoRef?.chapter_infos || []" :key="c.id">
            <NCheckbox :value="c.id" :disabled="downloadedChapterIds.has(c.id)">
              {{ c.name || '未命名' }}
            </NCheckbox>
          </template>
        </NCheckboxGroup>
      </NScrollbar>
      <template #action>
        <div style="display: flex; justify-content: flex-end; gap: 12px">
          <NButton @click="onChapterDialogCancel">取消</NButton>
          <NButton type="primary" @click="onChapterDialogConfirm">开始下载</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<script setup lang="ts" name="jmtt">
import { ref, onMounted, onUnmounted } from 'vue'
import { useMessage, NCheckbox, NCheckboxGroup, NScrollbar, NModal, NButton } from 'naive-ui'
import { useSettingStore } from '@renderer/plugins/store'

const message = useMessage()

const settingStore = useSettingStore()

const url = ref('https://jmcomic-zzz.one/')
const showChapterDialog = ref(false)
const comicInfoRef = ref<any>(null)
const selected = ref<Array<number | string>>([])
const downloadedChapterIds = ref<Set<number | string>>(new Set())
let resolveChapterDialog: ((ok: boolean) => void) | null = null
function simpleSanitize(filename, replacement = '') {
  if (typeof filename !== 'string') return ''
  return filename
    .replace(/[<>:"/\\|?*]/g, replacement) // 移除非法字符
    .replace(/^[\s.]+|[\s.]+$/g, '') // 移除首尾空格和点
}

function onChapterDialogConfirm() {
  showChapterDialog.value = false
  resolveChapterDialog?.(true)
  resolveChapterDialog = null
}
function onChapterDialogCancel() {
  showChapterDialog.value = false
  resolveChapterDialog?.(false)
  resolveChapterDialog = null
}
const webviewRef = ref<any>(null)
const canDownload = ref(false)
const comicId = ref<string | null>(null)

function updateCanDownload() {
  try {
    const wv = webviewRef.value
    if (!wv) return
    const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
    const match = currentUrl.match(/\/album\/(\d+)/)
    comicId.value = match ? match[1] : null
    canDownload.value = !!match
  } catch {
    comicId.value = null
    canDownload.value = false
  }
}

let msgReactive: any = null
function showChapterProgress(
  currentChapter: number,
  totalChapter: number,
  currentImage: number,
  totalImage: number
) {
  if (msgReactive)
    msgReactive.content = `下载进度：[第 ${currentChapter} / ${totalChapter} 章] ${currentImage} / ${totalImage} 张`
}

async function refreshDownloadedChapters(comicFolderPath: string) {
  downloadedChapterIds.value.clear()
  const chapters = comicInfoRef.value?.chapter_infos || []
  if (!chapters.length) return
  try {
    const folders = await window.file.getDirectChildrenFolders(comicFolderPath)
    const folderNames = new Set(folders.map((f: any) => f.name))
    if (chapters.length === 1) {
      // 单章：没有章节文件夹也视为已下载
      downloadedChapterIds.value.add(chapters[0].id)
    } else {
      chapters.forEach((c: any) => {
        const folderName = `第${c.index}章`
        if (folderNames.has(folderName)) downloadedChapterIds.value.add(c.id)
      })
    }
  } catch (e) {
    console.warn('读取已下载章节失败', e)
  }
}

async function download() {
  const wv = webviewRef.value
  if (!wv || !comicId.value) {
    message.error('webview 未准备好或未定位到漫画详情页')
    return
  }

  // 选择下载目录（jmtt 优先）
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
  // 获取漫画详情
  let comicInfo
  try {
    comicInfo = await window.jmDownloader.getComicInfo(comicId.value)
  } catch (e: any) {
    message.error(`获取章节失败：${e?.message || e}`)
    return
  }

  // 选择需要下载的章节（模板弹窗）
  comicInfoRef.value = comicInfo
  selected.value = comicInfo.chapter_infos.map((c: any) => c.id) // 默认全选
  const comicFolder = `${defaultDownloadPath}/${comicInfo.author[0]}/${simpleSanitize(comicInfo.name)}`
  await refreshDownloadedChapters(comicFolder)
  showChapterDialog.value = true
  const confirmed = await new Promise<boolean>((resolve) => {
    resolveChapterDialog = resolve
  })
  if (!confirmed) {
    message.warning('已取消下载')
    return
  }

  const toDownload = comicInfo.chapter_infos.filter((c) => selected.value.includes(c.id))
  if (toDownload.length === 0) {
    message.warning('未选择任何章节')
    return
  }
  // 逐章顺序下载，并显示进度
  msgReactive = message.create(`开始下载，共 ${toDownload.length} 章...`, {
    type: 'loading',
    duration: 0
  })
  if (toDownload.length === 1) {
    const chapterImages = await window.jmDownloader.getChapterImages(toDownload[0].id)
    for (let i = 0; i < chapterImages.length; i++) {
      const savePath = `${comicFolder}/${i.toString().padStart(5, '0')}.webp`
      showChapterProgress(1, 1, i + 1, chapterImages.length)
      await window.jmDownloader.downloadImage(savePath, chapterImages[i])
    }
  } else {
    console.log(toDownload.length)
    for (const chapter of toDownload) {
      try {
        const chapterFolder = `${comicFolder}/第${chapter.index}章`
        const chapterImages = await window.jmDownloader.getChapterImages(chapter.id)
        for (let i = 0; i < chapterImages.length; i++) {
          const savePath = `${chapterFolder}/${i.toString().padStart(5, '0')}.webp`
          showChapterProgress(chapter.index, toDownload.length, i + 1, chapterImages.length)
          await window.jmDownloader.downloadImage(savePath, chapterImages[i])
        }
        // 每章下载后暂停 5 秒，避免请求过于频繁
        await new Promise((r) => setTimeout(r, 5000))
      } catch (e: any) {
        message.error(`章节 ${chapter.index} 下载失败：${e?.message || '未知错误'}`)
        // 失败也稍作暂停，避免持续高频请求
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }
  msgReactive?.destroy()
  message.success('下载完成')
}
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
  const wv = webviewRef.value
  if (!wv) return
  const currentUrl: string = typeof wv.getURL === 'function' ? wv.getURL() : wv.src
  const match = currentUrl.match(/\/album_download\/(\d+)/)
  const comicId = match ? match[1] : null
  const comicInfo = await window.jmDownloader.getComicInfo(comicId)
  try {
    await window.electron.ipcRenderer.invoke('download:start', {
      fileName: `${simpleSanitize(comicInfo.name)}.${ext}`,
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

<template>
  <div class="site">
    <webview ref="webviewRef" :src="url" partition="persist:thirdparty" allowpopups />
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
const message = useMessage()
import { getDefaultDownloadPath, Tip } from './utils'
import { queue } from '@renderer/plugins/store/downloadQueue'
const { jmtt, file } = window as any

const url = ref('https://jmcomic-zzz.one/')
const showChapterDialog = ref(false)
const comicInfoRef = ref<any>(null)
const selected = ref<Array<number | string>>([])
const downloadedChapterIds = ref<Set<number | string>>(new Set())
let resolveChapterDialog: ((ok: boolean) => void) | null = null
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
async function refreshDownloadedChapters(comicFolderPath: string) {
  downloadedChapterIds.value.clear()
  const chapters = comicInfoRef.value?.chapter_infos || []
  if (!chapters.length) return
  try {
    const folders = await window.file.getDirectFoldersFromPath(comicFolderPath)
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
  const tip = new Tip()
  const wv = webviewRef.value
  if (!wv || !comicId.value) {
    tip.error('webview 未准备好或未定位到漫画详情页')
    return
  }
  const defaultDownloadPath = await getDefaultDownloadPath('downloadPathJmtt')
  // 获取漫画详情
  let comicInfo
  try {
    comicInfo = await jmtt.getComicInfo(comicId.value)
  } catch (e: any) {
    tip.error(`获取章节失败：${e?.message || e}`)
    return
  }
  let toDownload = []
  const comicFolder = `${defaultDownloadPath}/${comicInfo.author[0]}/${file.simpleSanitize(comicInfo.name)}`
  // 如果只有一章，则直接下载
  if (comicInfo.chapter_infos.length === 1) {
    toDownload = [comicInfo.chapter_infos[0]]
  } else {
    // 选择需要下载的章节（模板弹窗）
    comicInfoRef.value = comicInfo
    selected.value = comicInfo.chapter_infos.map((c: any) => c.id) // 默认全选
    await refreshDownloadedChapters(comicFolder)
    showChapterDialog.value = true
    const confirmed = await new Promise<boolean>((resolve) => {
      resolveChapterDialog = resolve
    })
    if (!confirmed) {
      tip.error('已取消下载')
      return
    }

    toDownload = comicInfo.chapter_infos.filter((c: any) => selected.value.includes(c.id))
    if (toDownload.length === 0) {
      tip.error('未选择任何章节')
      return
    }
  }
  queue.addTask(
    toDownload.map((chapter) => ({
      site: 'jmtt',
      title: `[${comicInfo.author}]${comicInfo.name} - 第${chapter.index}章`,
      payload: {
        chapter,
        comicInfo,
        baseDir: comicFolder
      }
    }))
  )
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

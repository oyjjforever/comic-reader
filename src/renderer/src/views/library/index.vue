<template>
  <div class="library-container">
    <resource-browser
      ref="resourceBrowserRef"
      :resource-paths="resourcePaths"
      :provide-tree="provideTree"
      :provide-list="mode === 'video' ? provideVideoList : undefined"
      :provide-favorites="provideFavorites"
      :namespace="namespace"
      :enable-highlights="mode === 'video'"
      :include-image-files="mode === 'book'"
      :random-loading="randomLoading"
      @random-open="openRandomMedia"
    >
      <template #card="{ item }">
        <unified-media-card
          :item="toMediaItem(item)"
          class="grid-item"
          :namespace="namespace"
          @open="openMedia"
        />
      </template>
    </resource-browser>

    <!-- 全屏阅读器覆盖层 -->
    <div v-if="isOpen" class="reader-overlay">
      <reader-view
        :key="currentItem?.path"
        v-bind="
          readerMode === 'file'
            ? { filePath: encodeURIComponent(currentItem?.path || '') }
            : { folderPath: encodeURIComponent(currentItem?.path || '') }
        "
        :module="namespace"
        :has-next="hasNext"
        :has-prev="hasPrev"
        @close="closeMedia"
        @next="nextMedia"
        @prev="prevMedia"
      />
    </div>
  </div>
</template>

<script setup lang="ts" name="library">
import type { FolderInfo } from '@/typings/file'
import { toMediaItem, type MediaItem } from '@/typings/media'
import UnifiedMediaCard from '@renderer/components/unified-media-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import ReaderView from '@renderer/views/reader/index.vue'
import { useMediaOpen } from '@renderer/composables/use-media-open'
import { useSettingStore } from '@renderer/plugins/store'

const route = useRoute()
const settingStore = useSettingStore()

// 同一组件服务 book/video 两个路由，按路由名区分行为
const mode = computed(() => (route.name === 'video' ? 'video' : 'book'))
const namespace = computed(() => mode.value)

const resourcePaths = computed(() =>
  mode.value === 'video'
    ? settingStore.setting.videoResourcePaths || []
    : settingStore.setting.resourcePaths || []
)

// ===== 数据提供者 =====
const provideTree = async (rootPath: string) => {
  return await window.media.getFolderTree(rootPath, mode.value === 'book')
}
const provideVideoList = async (folderPath: string) => {
  return await window.media.getFiles(folderPath, undefined, undefined, 'video')
}
const provideFavorites = async () => {
  const favorites = await window.favorite.getFavorites('id DESC', mode.value)
  const promises = favorites.map(async (fav) => {
    try {
      // book 收藏是文件夹，video 收藏是文件
      if (mode.value === 'book') {
        const info = await window.media.getFolderInfo(fav.fullPath)
        // 对tags进行处理，确保是数字数组
        fav.tags = fav.tags?.split(',').map(Number) || []
        return info ? { ...fav, ...info, isBookmarked: true } : null
      }
      const info = await window.media.getFileInfo(fav.fullPath)
      return info ? { ...info, isBookmarked: true } : null
    } catch (e) {
      console.warn(`Failed to load favorite: ${fav.fullPath}`, e)
      return null
    }
  })
  const results = await Promise.all(promises)
  return results.filter(Boolean) as FolderInfo[]
}

const resourceBrowserRef = ref()

// ===== 随机 =====
// 两级随机：从资源根开始随机游走——每层随机选一个子目录，直到无子目录（叶子），
// 每次随机只花树深几次目录请求，无需预建全量树。
// 落点按模块区分：书架=叶子文件夹（作品）；视频=叶子目录内随机一个视频文件（随机到文件级）。
// 落点无内容（空目录/无视频）时整条重来，最多 3 次。
// 收藏/历史/下载视图优先从当前网格随机，列表为空回退全库游走
const randomWalkItem = async (): Promise<MediaItem | null> => {
  const roots = [...resourcePaths.value].filter(Boolean)
  if (roots.length === 0) return null

  const walkOnce = async (): Promise<string> => {
    let current = roots[Math.floor(Math.random() * roots.length)]
    // 防御性深度上限，正常库 2~4 层就会落到叶子
    for (let depth = 0; depth < 20; depth++) {
      let children: FolderInfo[] = []
      try {
        children = await window.media.getFolderTree(current, false)
      } catch {
        break
      }
      if (children.length === 0) break
      current = children[Math.floor(Math.random() * children.length)].fullPath
    }
    return current
  }

  let result: MediaItem | null = null
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    const path = await walkOnce()
    const name = path.split(/[\\/]/).pop() || path
    try {
      if (mode.value === 'video') {
        // 视频模块：叶子目录内随机一个视频文件，播放器按单文件打开
        const files = await window.media.getFiles(path, undefined, undefined, 'video')
        if (files.length > 0) {
          const file = files[Math.floor(Math.random() * files.length)]
          result = {
            id: file.fullPath,
            kind: 'video',
            source: 'local',
            title: file.name,
            path: file.fullPath,
            videoPath: file.fullPath,
            fileCount: files.length
          }
        }
      } else {
        const info = await window.media.getFolderInfo(path)
        if (info && info.contentType !== 'empty') {
          result = {
            id: path,
            kind: 'comic',
            source: 'local',
            title: info.name || name,
            path,
            coverPath: info.coverPath,
            fileCount: info.fileCount
          }
        }
      }
    } catch {
      /* 该落点信息获取失败，重走一条 */
    }
  }
  return result
}

const provideRandomItem = async (): Promise<MediaItem | null> => {
  const viewMode = resourceBrowserRef.value?.getViewMode?.()
  if (['favorites', 'history', 'downloads'].includes(viewMode)) {
    const gridList = (resourceBrowserRef.value?.getFilterRows() || [])
      .map((folder: FolderInfo) => toMediaItem(folder))
      .filter((i) => !i.state)
    if (gridList.length > 0) {
      return gridList[Math.floor(Math.random() * gridList.length)]
    }
  }
  return randomWalkItem()
}

// ===== 打开分发 + 阅读器 overlay 状态 =====
const {
  isOpen,
  currentItem,
  readerMode,
  hasNext,
  hasPrev,
  openMedia,
  openRandomMedia,
  randomLoading,
  closeMedia,
  nextMedia,
  prevMedia
} = useMediaOpen({
  getList: () =>
    (resourceBrowserRef.value?.getFilterRows() || []).map((folder: FolderInfo) =>
      toMediaItem(folder)
    ),
  getRandomItem: provideRandomItem
})
</script>

<style lang="scss" scoped>
.library-container {
  height: 100%;
  width: 100%;
  position: relative;
}

.reader-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  background: #000;
}
</style>

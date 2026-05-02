<template>
  <div class="video-container">
    <resource-browser
      ref="resourceBrowserRef"
      :resource-paths="videoResourcePaths"
      :provide-tree="provideVideoTree"
      :provide-list="provideVideoList"
      :provide-favorites="provideVideoFavorites"
      namespace="video"
    >
      <template #card="{ item }">
        <media-card
          :folder="item"
          class="grid-item"
          namespace="video"
          @to-read="toRead(item)"
          @click="toRead(item)"
        />
      </template>
    </resource-browser>

    <!-- 全屏阅读器覆盖层 -->
    <div v-if="isReading" class="reader-overlay">
      <reader-view
        :key="currentFilePath"
        :file-path="encodeURIComponent(currentFilePath)"
        :has-next="hasNext"
        :has-prev="hasPrev"
        @close="closeReader"
        @next="loadNext"
        @prev="loadPrev"
      />
    </div>
  </div>
</template>

<script setup lang="ts" name="video">
import type { FolderInfo } from '@/typings/file'
import MediaCard from '@renderer/components/media-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import ReaderView from '@renderer/views/reader/index.vue'
import { useSettingStore } from '@renderer/plugins/store'
const message = useMessage()
const settingStore = useSettingStore()

const videoResourcePaths = computed(() => settingStore.setting.videoResourcePaths || [])

// 阅读器覆盖层状态
const isReading = ref(false)
const currentFilePath = ref('')
const currentFileIndex = ref(-1)

// 计算是否有上/下一个
const hasNext = computed(() => {
  if (currentFileIndex.value < 0) return false
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  return currentFileIndex.value < rows.length - 1
})
const hasPrev = computed(() => {
  if (currentFileIndex.value < 0) return false
  return currentFileIndex.value > 0
})

// 抽象的数据提供者（视频）
const provideVideoTree = async (rootPath: string) => {
  return await window.media.getFolderTree(rootPath, false)
}
const provideVideoList = async (folderPath: string) => {
  const data = await window.media.getFiles(folderPath, undefined, undefined, 'video')
  return data
}
const provideVideoFavorites = async () => {
  const favorites = await window.favorite.getFavorites('id DESC', 'video')

  // 使用 Promise.all 并行获取所有收藏项信息
  const promises = favorites.map(async (fav) => {
    try {
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

const toRead = (book: FolderInfo) => {
  // 使用全屏覆盖层打开阅读器
  currentFilePath.value = book.fullPath
  // 在当前网格列表中查找索引
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  currentFileIndex.value = rows.findIndex((item: FolderInfo) => item.fullPath === book.fullPath)
  isReading.value = true
}

const closeReader = () => {
  isReading.value = false
  currentFilePath.value = ''
  currentFileIndex.value = -1
}

// 加载下一个
const loadNext = () => {
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  const nextIndex = currentFileIndex.value + 1
  if (nextIndex < rows.length) {
    currentFilePath.value = rows[nextIndex].fullPath
    currentFileIndex.value = nextIndex
  }
}

// 加载上一个
const loadPrev = () => {
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  const prevIndex = currentFileIndex.value - 1
  if (prevIndex >= 0) {
    currentFilePath.value = rows[prevIndex].fullPath
    currentFileIndex.value = prevIndex
  }
}

const resourceBrowserRef = ref()
</script>

<style lang="scss" scoped>
.video-container {
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

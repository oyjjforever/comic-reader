<template>
  <div class="book-container">
    <resource-browser
      ref="resourceBrowserRef"
      :resource-paths="resourcePaths"
      :provide-tree="provideBookTree"
      :provide-favorites="provideBookFavorites"
      namespace="book"
    >
      <template #card="{ item }">
        <media-card
          :folder="item"
          class="grid-item"
          namespace="book"
          @to-read="toRead(item)"
          @click="toRead(item)"
        />
      </template>
    </resource-browser>

    <!-- 全屏阅读器覆盖层 -->
    <div v-if="isReading" class="reader-overlay">
      <reader-view
        :key="currentBookPath"
        :folder-path="encodeURIComponent(currentBookPath)"
        :has-next="hasNext"
        :has-prev="hasPrev"
        @close="closeReader"
        @next="loadNext"
        @prev="loadPrev"
      />
    </div>
  </div>
</template>

<script setup lang="ts" name="book">
import type { FolderInfo } from '@/typings/file'
import MediaCard from '@renderer/components/media-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import ReaderView from '@renderer/views/reader/index.vue'
import { useSettingStore } from '@renderer/plugins/store'
const message = useMessage()
const settingStore = useSettingStore()

const resourcePaths = computed(() => settingStore.setting.resourcePaths || [])

// 阅读器覆盖层状态
const isReading = ref(false)
const currentBookPath = ref('')
const currentBookIndex = ref(-1)

// 计算是否有上/下一篇
const hasNext = computed(() => {
  if (currentBookIndex.value < 0) return false
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  return currentBookIndex.value < rows.length - 1
})
const hasPrev = computed(() => {
  if (currentBookIndex.value < 0) return false
  return currentBookIndex.value > 0
})

// 抽象的数据提供者
const provideBookTree = async (rootPath: string) => {
  return await window.media.getFolderTree(rootPath, true)
}
const provideBookFavorites = async () => {
  const favorites = await window.favorite.getFavorites('id DESC', 'book')

  // 使用 Promise.all 并行获取所有收藏项信息
  const promises = favorites.map(async (fav) => {
    try {
      const info = await window.media.getFolderInfo(fav.fullPath)
      // 对tags进行处理，确保是数字数组
      fav.tags = fav.tags?.split(',').map(Number) || []
      return info ? { ...fav, ...info, isBookmarked: true } : null
    } catch (e) {
      console.warn(`Failed to load favorite: ${fav.fullPath}`, e)
      return null
    }
  })

  const results = await Promise.all(promises)
  return results.filter(Boolean) as FolderInfo[]
}

const toRead = (book: FolderInfo) => {
  // 检查文件夹是否还在加载中
  if (book.contentType === 'loading') {
    message.warning('文件夹信息正在加载中，请稍后再试')
    return
  }

  if (book.contentType === 'empty') {
    // 使用 naive-ui 的消息提示
    message.warning('该文件夹不包含任何文件')
    return
  }

  // 使用全屏覆盖层打开阅读器
  currentBookPath.value = book.fullPath
  // 在当前网格列表中查找索引
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  currentBookIndex.value = rows.findIndex((item: FolderInfo) => item.fullPath === book.fullPath)
  isReading.value = true
}

const closeReader = () => {
  isReading.value = false
  currentBookPath.value = ''
  currentBookIndex.value = -1
}

// 加载下一篇
const loadNext = () => {
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  const nextIndex = currentBookIndex.value + 1
  if (nextIndex < rows.length) {
    currentBookPath.value = rows[nextIndex].fullPath
    currentBookIndex.value = nextIndex
  }
}

// 加载上一篇
const loadPrev = () => {
  const rows = resourceBrowserRef.value?.getFilterRows() || []
  const prevIndex = currentBookIndex.value - 1
  if (prevIndex >= 0) {
    currentBookPath.value = rows[prevIndex].fullPath
    currentBookIndex.value = prevIndex
  }
}

const resourceBrowserRef = ref()
</script>

<style lang="scss" scoped>
.book-container {
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

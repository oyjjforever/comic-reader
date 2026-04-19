<template>
  <div class="book-container">
    <resource-browser
      ref="resourceBrowserRef"
      :resource-path="resourcePath"
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
      <reader-view :folder-path="encodeURIComponent(currentBookPath)" @close="closeReader" />
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

const resourcePath = computed(() => settingStore.setting.resourcePath)

// 阅读器覆盖层状态
const isReading = ref(false)
const currentBookPath = ref('')

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
  isReading.value = true
}

const closeReader = () => {
  isReading.value = false
  currentBookPath.value = ''
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

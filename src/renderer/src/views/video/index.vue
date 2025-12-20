<template>
  <resource-browser
    ref="resourceBrowserRef"
    :resource-path="videoResourcePath"
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
</template>

<script setup lang="ts" name="video">
import type { FolderInfo } from '@/typings/file'
import MediaCard from '@renderer/components/media-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import { useSettingStore } from '@renderer/plugins/store'
const message = useMessage()
const settingStore = useSettingStore()
const router = useRouter()

const videoResourcePath = computed(() => settingStore.setting.videoResourcePath)

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
  // 跳转到阅读页面
  router.push({
    name: 'reader',
    query: {
      filePath: encodeURIComponent(book.fullPath)
    }
  })
}

const resourceBrowserRef = ref()
</script>

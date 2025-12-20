<template>
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
</template>

<script setup lang="ts" name="book">
import type { FolderInfo } from '@/typings/file'
import MediaCard from '@renderer/components/media-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import { useSettingStore } from '@renderer/plugins/store'
const message = useMessage()
const settingStore = useSettingStore()
const router = useRouter()

const resourcePath = computed(() => settingStore.setting.resourcePath)

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
  // 检查是否为混合类型文件夹
  // if (book.contentType === 'mixed') {
  //   // 使用 naive-ui 的消息提示
  //   message.warning(
  //     '该文件夹包含多种类型的文件，请将不同类型的文件独立拆分到子文件夹中后再进行阅读'
  //   )
  //   return
  // }

  // 跳转到阅读页面
  router.push({
    name: 'reader',
    query: {
      folderPath: encodeURIComponent(book.fullPath)
    }
  })
}

const resourceBrowserRef = ref()
</script>

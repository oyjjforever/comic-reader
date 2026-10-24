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
import { toMediaItem } from '@/typings/media'
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

// ===== 打开分发 + 阅读器 overlay 状态 =====
const { isOpen, currentItem, readerMode, hasNext, hasPrev, openMedia, closeMedia, nextMedia, prevMedia } =
  useMediaOpen({
    getList: () =>
      (resourceBrowserRef.value?.getFilterRows() || []).map((folder: FolderInfo) =>
        toMediaItem(folder)
      )
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

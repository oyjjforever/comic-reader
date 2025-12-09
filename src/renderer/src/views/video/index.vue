<template>
  <resource-browser
    :resource-path="videoResourcePath"
    :provide-tree="provideVideoTree"
    :provide-list="provideVideoList"
    :provide-favorites="provideVideoFavorites"
    :build-context-menu="handleContextMenu"
  >
    <template #card="{ item }">
      <video-card
        :folder="item"
        class="grid-item"
        @click="toRead(item)"
        @contextmenu="(e) => handleContextMenu(e, item)"
      />
    </template>
  </resource-browser>
</template>

<script setup lang="ts" name="book">
import type { FolderInfo } from '@/typings/file'
import videoCard from './video-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import { useSettingStore } from '@renderer/plugins/store'
import ContextMenu from '@imengyu/vue3-context-menu'
const message = useMessage()
const settingStore = useSettingStore()
const router = useRouter()

const videoResourcePath = computed(() => settingStore.setting.videoResourcePath)

// 抽象的数据提供者（视频）
const provideVideoTree = async (rootPath: string) => {
  return await window.video.getFolderTree(rootPath)
}
const provideVideoList = async (folderPath: string) => {
  return await window.video.getFiles(folderPath)
}
const provideVideoFavorites = async () => {
  const favorites = await window.favorite.getFavorites('id DESC', 'video')

  // 使用 Promise.all 并行获取所有收藏项信息
  const promises = favorites.map(async (fav) => {
    try {
      const info = await window.video.getFileInfo(fav.fullPath)
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

function handleContextMenu(e: MouseEvent, folder: FolderInfo) {
  //prevent the browser's default menu
  e.preventDefault()
  //show your menu
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    items: [
      {
        label: '在文件管理器中打开',
        onClick: () => {
          window.systemInterface.openExplorer(folder.fullPath)
        }
      }
      // {
      //   label: '解压',
      //   onClick: () => {
      //     window.systemInterface.unzip(folder.fullPath)
      //   }
      // },
      // { label: 'A submenu', children: [{ label: 'Item1' }, { label: 'Item2' }, { label: 'Item3' }] }
    ]
  })
}

// 页面挂载时加载数据
onMounted(async () => {})

onUnmounted(() => {})
</script>

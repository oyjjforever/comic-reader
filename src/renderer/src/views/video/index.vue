<template>
  <resource-browser
    ref="resourceBrowserRef"
    :resource-path="videoResourcePath"
    :provide-tree="provideVideoTree"
    :provide-list="provideVideoList"
    :provide-favorites="provideVideoFavorites"
    :build-context-menu="handleContextMenu"
    namespace="video"
  >
    <template #card="{ item }">
      <media-card
        :folder="item"
        class="grid-item"
        @to-read="toRead(item)"
        @click="toRead(item)"
        @contextmenu="(e) => handleContextMenu(e, item)"
      />
    </template>
  </resource-browser>

  <!-- 标签管理弹窗 -->
  <tag-dialog
    v-model:show="showTagDialog"
    :media-path="currentFolder.fullPath || ''"
    :media-name="currentFolder.name || ''"
    media-type="video"
    namespace="video"
    @change="onTagsChange"
  />
</template>

<script setup lang="ts" name="video">
import type { FolderInfo } from '@/typings/file'
import MediaCard from '@renderer/components/media-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import TagDialog from '@renderer/components/tag-dialog.vue'
import { useSettingStore } from '@renderer/plugins/store'
import ContextMenu from '@imengyu/vue3-context-menu'
const message = useMessage()
const settingStore = useSettingStore()
const router = useRouter()

const videoResourcePath = computed(() => settingStore.setting.videoResourcePath)

// 标签弹窗相关状态
const showTagDialog = ref(false)
const currentFolder = ref<FolderInfo | null>({})

// 抽象的数据提供者（视频）
const provideVideoTree = async (rootPath: string) => {
  return await window.media.getFolderTree(rootPath, false)
}
const provideVideoList = async (folderPath: string) => {
  const data = await window.media.getFiles(folderPath, undefined, undefined, 'video')
  return data.map((_) => ({ ..._, coverPath: _.fullPath }))
}
const provideVideoFavorites = async () => {
  const favorites = await window.favorite.getFavorites('id DESC', 'video')

  // 使用 Promise.all 并行获取所有收藏项信息
  const promises = favorites.map(async (fav) => {
    try {
      const info = await window.media.getFileInfo(fav.fullPath)
      return info ? { ...info, coverPath: info.fullPath, isBookmarked: true } : null
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
async function handleContextMenu(e: MouseEvent, folder: FolderInfo) {
  //prevent the browser's default menu
  e.preventDefault()

  // 检查文件夹是否已被收藏
  const isFavorited = await window.favorite.isFavorited(folder.fullPath, 'book')

  //show your menu
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    items: [
      {
        label: isFavorited ? '修改标签' : '添加到收藏',
        onClick: () => {
          currentFolder.value = folder
          showTagDialog.value = true
        }
      },
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

const resourceBrowserRef = ref()

const onTagsChange = () => {
  if (resourceBrowserRef.value) {
    resourceBrowserRef.value.loadTags()
  }
}
// 页面挂载时加载数据
onMounted(async () => {})

onUnmounted(() => {})
</script>

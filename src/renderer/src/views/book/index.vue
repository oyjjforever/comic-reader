<template>
  <resource-browser
    :resource-path="resourcePath"
    :provide-tree="provideBookTree"
    :provide-list="provideBookList"
    :provide-favorites="provideBookFavorites"
    :build-context-menu="handleContextMenu"
  >
    <template #card="{ item }">
      <comic-card
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
import comicCard from '@renderer/components/comic-card.vue'
import ResourceBrowser from '@renderer/components/resource-browser.vue'
import { useSettingStore } from '@renderer/plugins/store'
import ContextMenu from '@imengyu/vue3-context-menu'
const message = useMessage()
const settingStore = useSettingStore()
const router = useRouter()

const resourcePath = computed(() => settingStore.setting.resourcePath)

// 抽象的数据提供者
const provideBookTree = async (rootPath: string) => {
  return await window.book.getFolderTree(rootPath)
}
const provideBookList = async (folderPath: string) => {
  return await window.book.getFolderList(folderPath)
}
const provideBookFavorites = async () => {
  const favorites = await window.favorite.getFavorites('id DESC', 'book')
  const result: FolderInfo[] = []
  for (const fav of favorites) {
    try {
      const info = await window.book.getFolderInfo(fav.fullPath)
      if (info) result.push({ ...info, isBookmarked: true })
    } catch (e) {
      // 忽略不存在项
    }
  }
  return result
}

const toRead = (book: FolderInfo) => {
  if (book.contentType === 'empty') {
    // 使用 naive-ui 的消息提示
    message.warning('该文件夹不包含任何文件')
    return
  }
  // 检查是否为混合类型文件夹
  if (book.contentType === 'mixed') {
    // 使用 naive-ui 的消息提示
    message.warning(
      '该文件夹包含多种类型的文件，请将不同类型的文件独立拆分到子文件夹中后再进行阅读'
    )
    return
  }

  // 跳转到阅读页面
  router.push({
    name: 'book.read',
    query: {
      folderPath: encodeURIComponent(book.fullPath),
      contentType: book.contentType,
      page: '1'
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
      },
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

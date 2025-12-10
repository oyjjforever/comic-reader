<template>
  <div class="home-container" :class="{ 'dark-mode': isDarkMode }">
    <header class="navbar">
      <div class="navbar-center">
        <n-input
          v-model:value="search.keyword"
          type="text"
          placeholder="请输入关键字进行搜索..."
          clearable
          class="search-input"
          @input="debounceQuery"
        >
          <template #prefix>
            <n-icon :component="SearchIcon" />
          </template>
        </n-input>
      </div>
      <div class="navbar-right">
        <n-button size="small" @click="refresh">刷新</n-button>
        <n-dropdown trigger="click" :options="sortOptions" @select="onSort">
          <n-button size="small">
            <template #icon><n-icon :component="ArrowSortDownLines24Regular" /></template>
            排序
          </n-button>
        </n-dropdown>
      </div>
    </header>

    <main class="main-content" v-if="resourcePath">
      <aside class="sidebar" :class="{ 'sidebar-hidden': isSidebarHidden }">
        <div class="sidebar-header">
          <h3 class="sidebar-title">文件夹</h3>
          <n-button text size="small" @click="toggleSidebar" class="sidebar-toggle">
            <template #icon>
              <n-icon :component="isSidebarHidden ? ChevronRightIcon : ChevronLeftIcon" />
            </template>
          </n-button>
        </div>
        <div class="sidebar-content">
          <n-tree
            :data="tree.data"
            :node-props="nodeProps"
            :on-load="handleTreeLoad"
            key-field="fullPath"
            label-field="name"
            block-line
            class="folder-tree"
            :default-expanded-keys="[props.resourcePath]"
          />
        </div>
      </aside>

      <section class="content-area">
        <div class="grid-view">
          <responsive-virtual-grid
            ref="virtualGridRef"
            :items="grid.filterRows"
            key-field="fullPath"
            :overscan="2"
            :min-item-width="minItemWidth"
            :max-item-width="maxItemWidth"
            :aspect-ratio="aspectRatio"
            :gap="gridGap"
            @scroll="handleScroll"
          >
            <template #default="{ item }">
              <slot name="card" :item="item" />
            </template>
          </responsive-virtual-grid>
        </div>
      </section>
    </main>

    <div v-else class="empty-state">
      <n-empty description="请先在设置中配置资源路径">
        <template #extra>
          <n-button @click="handleSettingClick" type="primary"> 前往设置 </n-button>
        </template>
      </n-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FolderInfo } from '@/typings/file'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import ContextMenu from '@imengyu/vue3-context-menu'
import {
  Bookmark as BookmarkIcon,
  Search as SearchIcon,
  ChevronBackOutline as ChevronLeftIcon,
  ChevronForwardOutline as ChevronRightIcon
} from '@vicons/ionicons5'
import { ArrowSortDownLines24Regular } from '@vicons/fluent'
import { NButton, NIcon, useMessage } from 'naive-ui'
import { debounce } from 'lodash'

interface ResourceBrowserProps {
  resourcePath: string | null
  // 数据提供者
  provideTree: (rootPath: string) => Promise<any[]>
  provideList: (folderPath: string) => Promise<FolderInfo[]>
  provideFavorites: () => Promise<FolderInfo[]>
  // 行为
  buildContextMenu?: (e: MouseEvent, item: FolderInfo) => void
  // 排序选项
  sortOptions?: Array<{ label: string; key: string }>
  // 虚拟网格参数（与 responsive-virtual-grid 对齐）
  minItemWidth?: number
  maxItemWidth?: number
  aspectRatio?: number
  gridGap?: number
}

const props = withDefaults(defineProps<ResourceBrowserProps>(), {
  sortOptions: () => [
    { label: '名称升序', key: 'name_asc' },
    { label: '名称降序', key: 'name_desc' },
    { label: '创建时间升序', key: 'createTime_asc' },
    { label: '创建时间降序', key: 'createTime_desc' }
  ],
  minItemWidth: 160,
  maxItemWidth: 250,
  aspectRatio: 0.75,
  gridGap: 1
})

const message = useMessage()
const router = useRouter()

// UI 状态
const isDarkMode = ref(false)
const isSidebarHidden = ref(false)

// 性能优化
const isLoading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const virtualGridRef = ref()

// 数据状态
const tree = reactive<{ data: any[]; currentNode: any; currentKey: string }>({
  data: [],
  currentNode: {},
  currentKey: ''
})
const grid = reactive<{ rows: FolderInfo[]; filterRows: FolderInfo[] }>({
  rows: [],
  filterRows: []
})
const search = reactive<{ keyword: string; sort: string }>({ keyword: '', sort: 'name_asc' })

// 侧边栏折叠
const toggleSidebar = () => {
  isSidebarHidden.value = !isSidebarHidden.value
}
// 设置按钮回调
const handleSettingClick = () => {
  router.push({ name: 'setting' })
}
// 排序
function onSort(key: string | number) {
  search.sort = String(key)
  debounceQuery()
}

// 搜索/排序
const query = async (keyword?: string) => {
  isLoading.value = true
  try {
    let list = [...grid.rows]
    const kw = (keyword ?? search.keyword).trim()
    if (kw) {
      const _kw = kw.toLowerCase()
      list = list.filter((folder) => folder.name?.toLowerCase().includes(_kw))
    }
    const sortFunctions: Record<string, (a: FolderInfo, b: FolderInfo) => number> = {
      name_asc: (a, b) =>
        a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }),
      name_desc: (a, b) =>
        b.name.localeCompare(a.name, 'zh-CN', { numeric: true, sensitivity: 'base' }),
      createTime_asc: (a, b) => a.createdTime.getTime() - b.createdTime.getTime(),
      createTime_desc: (a, b) => b.createdTime.getTime() - a.createdTime.getTime()
    }
    const sortFn = sortFunctions[search.sort]
    if (sortFn) list.sort(sortFn)
    grid.filterRows = list
  } catch (e) {
    console.error('查询失败', e)
  } finally {
    isLoading.value = false
  }
}
const debounceQuery = debounce(query, 300)
const refresh = async () => {
  if (!props.resourcePath) return
  isLoading.value = true
  try {
    fetchTreeData()
  } finally {
    isLoading.value = false
  }
}

// 树节点属性
const nodeProps = ({ option }: { option: any }) => {
  return {
    onClick(e: MouseEvent) {
      // 检查点击的是否是展开/折叠图标区域
      const target = e.target as HTMLElement
      const isExpandIcon = target.closest('.n-tree-node-switcher')

      // 如果点击的是展开图标，不执行点击逻辑
      if (isExpandIcon) {
        return
      }
      tree.currentKey = option.fullPath
      if (option.fullPath === '__favorites__') {
        getFavorites()
        return
      }
      tree.currentNode = option
      onTreeNodeClick(option.fullPath as string)
    }
  }
}
// 懒加载处理
const handleTreeLoad = (node: any) => {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await props.provideTree(node.fullPath)
      node.children = res
      resolve()
    } catch (error: any) {
      message.error(`加载子节点失败: ${error.message}`)
      resolve()
    }
  })
}

// 收藏
const getFavorites = async () => {
  const favoritesPath = '__favorites__'
  if (dataCache.currentPath === favoritesPath && dataCache.isDataLoaded) {
    tree.currentKey = favoritesPath
    return
  }
  try {
    isLoading.value = true
    const favorites = await props.provideFavorites()
    grid.filterRows = grid.rows = favorites
    dataCache.currentPath = favoritesPath
    dataCache.isDataLoaded = true
    dataCache.lastLoadTime = Date.now()
    virtualGridRef.value?.scrollToTop()
  } catch (error: any) {
    message.error(`获取收藏失败: ${error.message}`)
    dataCache.isDataLoaded = false
  } finally {
    isLoading.value = false
  }
}

// 缓存（keep-alive）
const dataCache = reactive({
  currentPath: '',
  isDataLoaded: false,
  lastLoadTime: 0
})

// 树节点点击
const onTreeNodeClick = async (folderPath: string) => {
  if (dataCache.currentPath === folderPath && dataCache.isDataLoaded) {
    tree.currentKey = folderPath
    return
  }
  if (virtualGridRef.value && dataCache.currentPath) {
    virtualGridRef.value.saveScrollPosition()
  }
  isLoading.value = true
  tree.currentKey = folderPath

  try {
    if (props.provideList) {
      grid.filterRows = grid.rows = await props.provideList(folderPath)
    } else {
      // 第一阶段：快速加载基本信息
      const basicFolders = await window.media.getFolderListBasic(folderPath)
      grid.filterRows = grid.rows = basicFolders
      query()
      // 第二阶段：渐进式加载详细信息
      loadDetailsProgressively(basicFolders)
    }
    dataCache.currentPath = folderPath
    dataCache.isDataLoaded = true
    dataCache.lastLoadTime = Date.now()
    virtualGridRef.value?.scrollToTop()
  } catch (error: any) {
    message.error(`获取子文件夹失败: ${error.message}`)
    dataCache.isDataLoaded = false
  } finally {
    isLoading.value = false
  }
}

// 渐进式加载详细信息
const loadDetailsProgressively = async (folders: any[]) => {
  const batchSize = 10 // 每批处理10个文件夹
  for (let i = 0; i < folders.length; i += batchSize) {
    const batch = folders.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (folder) => {
        try {
          const details = await window.media.loadFolderDetails(folder.fullPath)
          // 更新对应的文件夹信息
          const index = grid.rows.findIndex((f) => f.fullPath === folder.fullPath)
          if (index !== -1) {
            grid.rows[index] = { ...grid.rows[index], ...details }
            // 同时更新 filterRows 中的对应项
            const filterIndex = grid.filterRows.findIndex((f) => f.fullPath === folder.fullPath)
            if (filterIndex !== -1) {
              grid.filterRows[filterIndex] = { ...grid.filterRows[filterIndex], ...details }
            }
          }
        } catch (error) {
          console.warn(`Failed to load details for ${folder.fullPath}:`, error)
        }
      })
    )

    // 每批处理后短暂暂停，避免阻塞UI
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // 重新应用搜索和排序
  query()
}

// 预加载下一页数据
const preloadNextPage = async () => {
  if (loadingMore.value || !hasMore.value || !dataCache.currentPath) return
  loadingMore.value = true
  try {
    const nextPage = await window.media.getFolderListPaginated(
      dataCache.currentPath,
      Math.ceil(grid.rows.length / 50),
      50
    )
    grid.rows.push(...nextPage.folders)
    hasMore.value = nextPage.hasMore
    query()
  } catch (error) {
    console.error('预加载失败:', error)
  } finally {
    loadingMore.value = false
  }
}

// 滚动事件处理
const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target

  // 当滚动到底部60%时开始预加载
  if (scrollTop + clientHeight >= scrollHeight * 0.6) {
    preloadNextPage()
  }
}

// 加载树
const fetchTreeData = async () => {
  if (!props.resourcePath) return
  isLoading.value = true
  try {
    const treeData = await props.provideTree(props.resourcePath)
    tree.data = [
      {
        name: '我的收藏',
        fullPath: '__favorites__',
        isLeaf: true,
        prefix: () => h(NIcon, { component: BookmarkIcon, color: '#FFD700' })
      },
      { name: '资源目录', fullPath: props.resourcePath, children: treeData }
    ]
    onTreeNodeClick(props.resourcePath as string)
  } catch (error: any) {
    message.error(`获取文件夹失败: ${error.message}`)
  } finally {
    isLoading.value = false
  }
}

// 右键菜单
function handleContextMenu(e: MouseEvent, folder: FolderInfo) {
  e.preventDefault()
  if (props.buildContextMenu) {
    props.buildContextMenu(e, folder)
  }
}

// 事件与生命周期
onMounted(async () => {
  fetchTreeData()
})

onActivated(() => {
  if (!tree.data?.length && props.resourcePath) {
    fetchTreeData()
  }
  virtualGridRef.value?.restoreScrollPosition()
})

onDeactivated(() => {
  virtualGridRef.value?.saveScrollPosition()
})

// 暴露方法
defineExpose({
  scrollToTop: () => virtualGridRef.value?.scrollToTop(),
  scrollToIndex: (index: number) => virtualGridRef.value?.scrollToIndex(index),
  saveScrollPosition: () => virtualGridRef.value?.saveScrollPosition(),
  restoreScrollPosition: () => virtualGridRef.value?.restoreScrollPosition(),
  getScrollPosition: () => virtualGridRef.value?.getScrollPosition() || 0,
  setScrollPosition: (position: number) => virtualGridRef.value?.setScrollPosition(position),
  getStats: () => virtualGridRef.value?.getStats()
})
</script>

<style scoped lang="scss">
/* 复用原页面的样式类名以避免大面积改动 */
.home-container {
  @apply h-full w-full flex flex-col bg-white text-gray-900;
}
.navbar {
  @apply flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm;
  height: 64px;
  flex-shrink: 0;
  &-center {
    @apply flex-1 max-w-md mx-6;
    .search-input {
      @apply w-full;
    }
  }
  &-right {
    @apply flex items-center gap-2;
    flex: 0 0 auto;
  }
}
.main-content {
  @apply flex flex-1 overflow-hidden;
}
.sidebar {
  @apply bg-gray-50 border-r border-gray-200 flex flex-col;
  width: 20%;
  min-width: 256px;
  &-hidden {
    width: 48px;
    min-width: 48px;
    .sidebar-title,
    .sidebar-content {
      @apply hidden;
    }
  }
  &-header {
    @apply flex items-center justify-between px-4 py-3 border-b border-gray-200;
    flex-shrink: 0;
  }
  &-title {
    @apply text-sm font-medium text-gray-700 m-0;
  }
  &-content {
    @apply flex-1 overflow-auto p-2;
  }
}
.folder-tree {
  @apply text-sm;
}
.content-area {
  @apply flex-1 flex flex-col overflow-hidden;
}
.grid-view {
  @apply flex-1 overflow-hidden p-3;
}
.empty-state {
  @apply flex-1 flex items-center justify-center;
}
</style>

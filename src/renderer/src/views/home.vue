<template>
  <div class="home-container" :class="{ 'dark-mode': isDarkMode }">
    <!-- 顶部导航栏 -->
    <header class="navbar">
      <!-- 左侧：视图切换 -->
      <!-- <div class="navbar-left">
        <n-button-group>
          <n-button
            :type="viewMode === 'grid' ? 'primary' : 'default'"
            @click="viewMode = 'grid'"
            size="small"
          >
            <template #icon>
              <n-icon :component="GridIcon" />
            </template>
            网格
          </n-button>
          <n-button
            :type="viewMode === 'list' ? 'primary' : 'default'"
            @click="viewMode = 'list'"
            size="small"
          >
            <template #icon>
              <n-icon :component="ListIcon" />
            </template>
            列表
          </n-button>
        </n-button-group>
      </div> -->

      <!-- 中间：搜索框 -->
      <div class="navbar-center">
        <n-input
          v-model="search.keyword"
          type="text"
          placeholder="搜索漫画..."
          clearable
          class="search-input"
          :loading="isSearching"
          @input="onQuery"
        >
          <template #prefix>
            <n-icon :component="searchIcon" />
          </template>
        </n-input>
      </div>

      <!-- 右侧：功能按钮 -->
      <div class="navbar-right">
        <n-button size="small" @click="toggleDarkMode">
          <template #icon>
            <n-icon :component="isDarkMode ? SunIcon : MoonIcon" />
          </template>
          {{ isDarkMode ? '明亮' : '夜间' }}
        </n-button>
        <n-dropdown trigger="click" :options="options" @select="onSort">
          <n-button>排序</n-button>
        </n-dropdown>
        <n-button size="small" @click="settingHandleClick">
          <template #icon>
            <n-icon :component="settingIcon" />
          </template>
          设置
        </n-button>
      </div>
    </header>
    <!-- 加载状态 -->
    <!-- <div v-if="isLoading" class="loading-container">
      <n-spin size="large">
        <template #description> 正在加载文件夹... </template>
      </n-spin>
    </div> -->
    <!-- 主体内容区域 -->
    <main class="main-content" v-if="resourcePath">
      <!-- 左侧文件树 -->
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
            key-field="fullPath"
            label-field="name"
            block-line
            class="folder-tree"
            default-expand-all
          />
        </div>
      </aside>

      <!-- 右侧主内容区 -->
      <section class="content-area">
        <!-- 网格视图 -->
        <div class="grid-view" @scroll="handleScroll">
          <div class="grid-container">
            <comic-card
              v-for="folder in displayedFolderList"
              :key="folder.fullPath"
              :folder="folder"
              class="grid-item"
              @click="toRead(folder)"
              @contextmenu="(e) => handleContextMenu(e, folder)"
            />
          </div>

          <!-- 加载更多按钮 -->
          <div v-if="hasMoreToRender" class="load-more-container">
            <n-button @click="loadMoreBatch" :loading="isSearching">
              加载更多 ({{ displayedFolderList.length }}/{{ filteredFolderList.length }})
            </n-button>
          </div>
        </div>
      </section>
    </main>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <n-empty description="请先在设置中配置资源路径">
        <template #extra>
          <n-button @click="settingHandleClick" type="primary"> 前往设置 </n-button>
        </template>
      </n-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FolderInfo } from '@/typings/file'
import comicCard from '@renderer/components/comic-card.vue'
import { useSettingStore } from '@renderer/plugins/store'
import {
  Search as searchIcon,
  SettingsSharp as settingIcon,
  Grid as GridIcon,
  List as ListIcon,
  Sunny as SunIcon,
  Moon as MoonIcon,
  ChevronForward as ChevronRightIcon,
  ChevronBack as ChevronLeftIcon,
  Bookmark as BookmarkIcon
} from '@vicons/ionicons5'
import useSetting from '@renderer/components/setting'
import { NButton, NIcon, DataTableColumns } from 'naive-ui'
import ContextMenu from '@imengyu/vue3-context-menu'
import { computed, reactive } from 'vue'
import { debounce, throttle } from 'lodash'
const message = useMessage()
const settingStore = useSettingStore()
const setting = useSetting()
const router = useRouter()

// 界面状态
const isDarkMode = ref(false)
const isSidebarHidden = ref(false)

// 性能优化状态
const isLoading = ref(false)
const isSearching = ref(false)
const renderBatchSize = ref(20) // 每批渲染的数量
const currentBatch = ref(1) // 当前渲染到第几批
const resourcePath = computed(() => settingStore.setting.resourcePath)

const options = [
  {
    label: '名称升序',
    key: 'name_asc'
  },
  {
    label: '名称降序',
    key: 'name_desc'
  },
  {
    label: '创建时间升序',
    key: 'createTime_asc'
  },
  {
    label: '创建时间降序',
    key: 'createTime_desc'
  }
]

const tree = reactive({
  data: [],
  currentNode: {},
  currentKey: ''
})
const grid = reactive({
  rows: [],
  filterRows: []
})
const search = reactive({
  keyword: '',
  sort: 'name_asc'
})

// 优化后的过滤和排序逻辑
const filteredFolderList = computed(() => {
  if (isSearching.value) {
    return grid.filterRows
  }

  let list = [...grid.rows] // 浅拷贝避免修改原数组

  // 搜索过滤
  if (search.keyword) {
    const searchTerm = search.keyword.toLowerCase()
    list = list.filter((folder) => folder.name.toLowerCase().includes(searchTerm))
  }

  // 排序 - 使用更高效的排序算法
  const sortFunctions = {
    name_asc: (a: FolderInfo, b: FolderInfo) => a.name.localeCompare(b.name),
    name_desc: (a: FolderInfo, b: FolderInfo) => b.name.localeCompare(a.name),
    createTime_asc: (a: FolderInfo, b: FolderInfo) =>
      a.createdTime.getTime() - b.createdTime.getTime(),
    createTime_desc: (a: FolderInfo, b: FolderInfo) =>
      b.createdTime.getTime() - a.createdTime.getTime()
  }

  const sortFn = sortFunctions[search.sort as keyof typeof sortFunctions]
  if (sortFn) {
    list.sort(sortFn)
  }

  return list
})
// 分批渲染优化 - 移除分页逻辑
const displayedFolderList = computed(() => {
  const list = filteredFolderList.value

  // 如果数据量大，分批渲染
  if (list.length > renderBatchSize.value) {
    const batchEnd = Math.min(currentBatch.value * renderBatchSize.value, list.length)
    return list.slice(0, batchEnd)
  }

  return list
})

// 是否还有更多数据需要渲染
const hasMoreToRender = computed(() => {
  return currentBatch.value * renderBatchSize.value < filteredFolderList.value.length
})

// 方法
const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
  // 这里可以保存到设置中
}

const toggleSidebar = () => {
  isSidebarHidden.value = !isSidebarHidden.value
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

// 获取文件夹列表 - 优化版本
const fetchTreeData = async () => {
  if (!resourcePath.value) return
  isLoading.value = true
  try {
    // 并行加载树形数据和平铺数据
    const treeData = await window.book.getFolders(resourcePath.value, 'tree')
    console.log(treeData)
    tree.data = [
      {
        name: '我的收藏',
        fullPath: '__favorites__',
        isLeaf: true,
        prefix: () => h(NIcon, { component: BookmarkIcon, color: '#FFD700' })
      },
      { name: '资源目录', fullPath: resourcePath.value, children: treeData }
    ]
    currentBatch.value = 1
    onTreeNodeClick(resourcePath.value as string)
  } catch (error: any) {
    message.error(`获取文件夹失败: ${error.message}`)
  } finally {
    isLoading.value = false
  }
}
function onSort(key: string | number) {
  search.sort = key
  onQuery()
}
// 防抖搜索函数
const onQuery = debounce(async (keyword?: string) => {
  isSearching.value = true

  try {
    let list = [...grid.rows]
    if (keyword) {
      const _keyword = keyword.toLowerCase()
      list = list.filter((folder) => folder.name.toLowerCase().includes(_keyword))
    }

    // 排序
    const sortFunctions = {
      name_asc: (a: FolderInfo, b: FolderInfo) => a.name.localeCompare(b.name),
      name_desc: (a: FolderInfo, b: FolderInfo) => b.name.localeCompare(a.name),
      createTime_asc: (a: FolderInfo, b: FolderInfo) =>
        a.createdTime.getTime() - b.createdTime.getTime(),
      createTime_desc: (a: FolderInfo, b: FolderInfo) =>
        b.createdTime.getTime() - a.createdTime.getTime()
    }

    const sortFn = sortFunctions[search.sort as keyof typeof sortFunctions]
    if (sortFn) {
      list.sort(sortFn)
    }

    grid.filterRows = list
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    isSearching.value = false
  }
}, 300) // 300ms 防抖延迟

// 分批加载更多数据
const loadMoreBatch = throttle(() => {
  if (hasMoreToRender.value) {
    currentBatch.value++
  }
}, 100)

// 获取收藏的书籍
const getFavoriteBooks = async () => {
  try {
    isLoading.value = true

    const favorites = await window.favorite.getFavorites()
    // 将收藏路径转换为 FolderInfo 格式
    const favoriteBooks: FolderInfo[] = []

    for (const favorite of favorites) {
      try {
        // 检查路径是否存在并获取文件夹信息
        const folderInfo = await window.book.getFolderInfo(favorite.fullPath)

        if (folderInfo) {
          favoriteBooks.push({
            ...folderInfo,
            isBookmarked: true
          })
        }
      } catch (error) {
        console.warn(`收藏路径不存在或无法访问: ${favorite.fullPath}`)
      }
    }

    grid.rows = favoriteBooks
    currentBatch.value = 1
  } catch (error) {
    message.error(`获取收藏书籍失败: ${(error as Error).message}`)
  } finally {
    isLoading.value = false
  }
}

// 树节点属性
const nodeProps = ({ option }) => {
  return {
    onClick() {
      tree.currentKey = option.fullPath
      // 收藏节点特殊处理
      if (option.fullPath === '__favorites__') {
        getFavoriteBooks()
        return
      }

      if (option.isLeaf) return
      tree.currentNode = option
      onTreeNodeClick(option.fullPath as string)
    }
  }
}

// 滚动处理 - 自动加载更多
const handleScroll = throttle((event: Event) => {
  const target = event.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target

  // 当滚动到底部附近时自动加载更多
  if (
    scrollHeight - scrollTop - clientHeight < 200 &&
    hasMoreToRender.value &&
    !isSearching.value
  ) {
    loadMoreBatch()
  }
}, 100)

// 树节点点击事件 - 优化版本
const onTreeNodeClick = async (folderPath: string) => {
  isLoading.value = true
  tree.currentKey = folderPath
  try {
    grid.rows = await window.book.getFolders(folderPath, 'flat')
    // 重置状态
    currentBatch.value = 1
  } catch (error) {
    message.error(`获取子文件夹失败: ${(error as Error).message}`)
  } finally {
    isLoading.value = false
  }
}

// 设置按钮回调
const settingHandleClick = () => {
  setting.open(fetchTreeData)
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
      {
        label: '解压',
        onClick: () => {
          window.systemInterface.unzip(folder.fullPath)
        }
      },
      {
        label: 'A submenu',
        children: [{ label: 'Item1' }, { label: 'Item2' }, { label: 'Item3' }]
      }
    ]
  })
}
// 页面挂载时加载数据
onMounted(async () => {
  await settingStore.updateSetting()
  fetchTreeData()
})
</script>

<style>
/* 主容器 */
.home-container {
  @apply h-screen flex flex-col;
  @apply bg-white text-gray-900;
  transition: all 0.3s ease;
}

.home-container.dark-mode {
  @apply bg-gray-900 text-gray-100;
}

/* 导航栏 */
.navbar {
  @apply flex items-center justify-between px-6 py-4;
  @apply bg-white border-b border-gray-200;
  @apply shadow-sm;
  height: 64px;
  flex-shrink: 0;
}

.dark-mode .navbar {
  @apply bg-gray-800 border-gray-700;
}

.navbar-left {
  @apply flex items-center gap-3;
  flex: 0 0 auto;
}

.navbar-center {
  @apply flex-1 max-w-md mx-6;
}

.search-input {
  @apply w-full;
}

.navbar-right {
  @apply flex items-center gap-2;
  flex: 0 0 auto;
}

/* 主内容区 */
.main-content {
  @apply flex flex-1 overflow-hidden;
}

/* 侧边栏 */
.sidebar {
  @apply w-1/5 min-w-64 bg-gray-50 border-r border-gray-200;
  @apply flex flex-col;
  transition: all 0.3s ease;
}

.dark-mode .sidebar {
  @apply bg-gray-800 border-gray-700;
}

.sidebar-hidden {
  @apply w-12 min-w-12;
}

.sidebar-header {
  @apply flex items-center justify-between px-4 py-3;
  @apply border-b border-gray-200;
  flex-shrink: 0;
}

.dark-mode .sidebar-header {
  @apply border-gray-700;
}

.sidebar-title {
  @apply text-sm font-medium text-gray-700;
  @apply m-0;
}

.dark-mode .sidebar-title {
  @apply text-gray-300;
}

.sidebar-hidden .sidebar-title {
  @apply hidden;
}

.sidebar-content {
  @apply flex-1 overflow-auto p-2;
}

.sidebar-hidden .sidebar-content {
  @apply hidden;
}

.folder-tree {
  @apply text-sm;
}

/* 内容区域 */
.content-area {
  @apply flex-1 flex flex-col overflow-hidden;
}

.breadcrumb {
  @apply px-6 py-3 border-b border-gray-200;
  flex-shrink: 0;
}

.dark-mode .breadcrumb {
  @apply border-gray-700;
}

.content-stats {
  @apply px-6 py-3 border-b border-gray-200;
  flex-shrink: 0;
}

.dark-mode .content-stats {
  @apply border-gray-700;
}

/* 网格视图 */
.grid-view {
  @apply flex-1 overflow-auto p-6;
}

.grid-container {
  @apply grid gap-6;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.grid-item {
  @apply transition-all duration-200;
}

/* 列表视图 */
.list-view {
  @apply flex-1 overflow-auto;
}

.list-table {
  @apply h-full;
}

.list-cover {
  @apply flex items-center justify-center;
  @apply text-gray-400;
}

/* 加载状态 */
.loading-container {
  @apply flex-1 flex items-center justify-center;
  min-height: 400px;
}

/* 加载更多 */
.load-more-container {
  @apply flex justify-center py-6;
}

/* 空状态 */
.empty-state {
  @apply flex-1 flex items-center justify-center;
}

/* 动画 */
.card-enter-active,
.card-leave-active {
  transition: all 0.3s ease;
}

.card-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.card-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .sidebar {
    @apply w-1/4 min-w-48;
  }

  .grid-container {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}

@media (max-width: 768px) {
  .navbar {
    @apply px-4 py-3;
  }

  .navbar-center {
    @apply mx-4;
  }

  .sidebar {
    @apply absolute z-10 h-full;
    @apply w-64;
  }

  .sidebar-hidden {
    @apply -translate-x-full;
  }

  .grid-container {
    @apply gap-4;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }

  .content-area {
    @apply w-full;
  }
}

@media (max-width: 640px) {
  .navbar-left,
  .navbar-right {
    @apply gap-1;
  }

  .grid-container {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>

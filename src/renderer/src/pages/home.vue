<template>
  <div class="home-container" :class="{ 'dark-mode': isDarkMode }">
    <!-- 顶部导航栏 -->
    <header class="navbar">
      <!-- 左侧：视图切换 -->
      <div class="navbar-left">
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
      </div>

      <!-- 中间：搜索框 -->
      <div class="navbar-center">
        <n-input
          v-model:value="filterForm.name"
          type="text"
          placeholder="搜索漫画..."
          clearable
          class="search-input"
          :loading="isSearching"
          @input="handleSearchInput"
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

        <n-button size="small" @click="settingHandleClick">
          <template #icon>
            <n-icon :component="settingIcon" />
          </template>
          设置
        </n-button>
      </div>
    </header>
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-container">
      <n-spin size="large">
        <template #description> 正在加载文件夹... </template>
      </n-spin>
    </div>
    <!-- 主体内容区域 -->
    <main class="main-content" v-else-if="settingStore.setting.resourcePath">
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
            :data="folderTreeData"
            :node-props="nodeProps"
            key-field="fullPath"
            label-field="name"
            selectable
            block-line
            class="folder-tree"
            default-expand-all
          />
        </div>
      </aside>

      <!-- 右侧主内容区 -->
      <section class="content-area">
        <!-- 网格视图 -->
        <div v-if="viewMode === 'grid'" class="grid-view" @scroll="handleScroll">
          <div class="grid-container">
            <comic-card
              v-for="folder in displayedFolderList"
              :key="folder.fullPath"
              :folder="folder"
              class="grid-item"
              @click="toRead(folder)"
            />
          </div>

          <!-- 加载更多按钮 -->
          <div v-if="hasMoreToRender" class="load-more-container">
            <n-button @click="loadMoreBatch" :loading="isSearching">
              加载更多 ({{ displayedFolderList.length }}/{{ filteredFolderList.length }})
            </n-button>
          </div>
        </div>

        <!-- 列表视图 -->
        <div v-else class="list-view">
          <n-data-table
            :columns="listColumns"
            :data="displayedFolderList"
            :pagination="false"
            :bordered="false"
            :loading="isSearching"
            striped
            @row-click="toRead"
            class="list-table"
          />
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
import { computed, h, onMounted, ref, nextTick, shallowRef } from 'vue'
import type { FolderInfo } from '@/typings/file'
import comicCard from '@renderer/components/comic-card.vue'
import { useSettingStore } from '@renderer/plugins/store'
import { useMessage, DataTableColumns, NIcon, NButton } from 'naive-ui'
import {
  Search as searchIcon,
  SettingsSharp as settingIcon,
  Grid as GridIcon,
  List as ListIcon,
  Sunny as SunIcon,
  Moon as MoonIcon,
  ChevronForward as ChevronRightIcon,
  ChevronBack as ChevronLeftIcon,
  Bookmark as BookmarkIcon,
  Book as BookIcon
} from '@vicons/ionicons5'
import useSetting from '@renderer/components/setting/setting'
import { useRouter } from 'vue-router'

// 防抖函数
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null
  return ((...args: any[]) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }) as T
}

// 节流函数
function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
  let inThrottle: boolean
  return ((...args: any[]) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }) as T
}

const message = useMessage()
const settingStore = useSettingStore()
const setting = useSetting()
const router = useRouter()

// 界面状态
const viewMode = ref<'grid' | 'list'>('grid')
const isDarkMode = ref(false)
const isSidebarHidden = ref(false)

// 性能优化状态
const isLoading = ref(false)
const isSearching = ref(false)
const renderBatchSize = ref(20) // 每批渲染的数量
const currentBatch = ref(1) // 当前渲染到第几批

// 定义筛选条件
const filterForm = ref<{
  name?: string
  order: 'id ASC' | 'id DESC' | 'updated_at ASC' | 'updated_at DESC'
}>({
  order: settingStore.setting.bookSort || 'id DESC'
})

// 列表视图列定义
const listColumns: DataTableColumns<FolderInfo> = [
  {
    title: '阅读',
    key: 'name',
    width: 80,
    align: 'center',
    render: (row) => {
      return h(
        NButton,
        {
          onClick: () => toRead(row)
        },
        [h(NIcon, { component: BookIcon, size: 16 })]
      )
    }
  },
  {
    title: '名称',
    key: 'name',
    ellipsis: {
      tooltip: true
    },
    sorter: (row1, row2) => row1.name.localeCompare(row2.name)
  },
  {
    title: '文件数',
    key: 'fileCount',
    width: 100,
    sorter: (row1, row2) => row1.fileCount - row2.fileCount
  },
  {
    title: '内容类型',
    key: 'contentType',
    width: 100
  },
  {
    title: '路径',
    key: 'fullPath',
    ellipsis: {
      tooltip: true
    }
  }
]

// 文件夹相关状态
const folderTreeData = ref<any[]>([])
const currentFolderList = shallowRef<FolderInfo[]>([]) // 使用 shallowRef 提升性能
const currentSortKey = ref('name_asc')
const isShowingFavorites = ref(false) // 是否正在显示收藏

// 缓存搜索结果
const searchCache = new Map<string, FolderInfo[]>()
const filteredCache = ref<FolderInfo[]>([])

// 优化后的过滤和排序逻辑
const filteredFolderList = computed(() => {
  if (isSearching.value) {
    return filteredCache.value
  }

  let list = [...currentFolderList.value] // 浅拷贝避免修改原数组

  // 搜索过滤
  if (filterForm.value.name) {
    const searchTerm = filterForm.value.name.toLowerCase()
    const cacheKey = `${searchTerm}_${currentSortKey.value}`

    if (searchCache.has(cacheKey)) {
      return searchCache.get(cacheKey)!
    }

    list = list.filter((folder) => folder.name.toLowerCase().includes(searchTerm))
  }

  // 排序 - 使用更高效的排序算法
  const sortFunctions = {
    name_asc: (a: FolderInfo, b: FolderInfo) => a.name.localeCompare(b.name),
    name_desc: (a: FolderInfo, b: FolderInfo) => b.name.localeCompare(a.name),
    fileCount_asc: (a: FolderInfo, b: FolderInfo) => a.fileCount - b.fileCount,
    fileCount_desc: (a: FolderInfo, b: FolderInfo) => b.fileCount - a.fileCount
  }

  const sortFn = sortFunctions[currentSortKey.value as keyof typeof sortFunctions]
  if (sortFn) {
    list.sort(sortFn)
  }

  // 缓存结果
  if (filterForm.value.name) {
    const cacheKey = `${filterForm.value.name.toLowerCase()}_${currentSortKey.value}`
    searchCache.set(cacheKey, list)

    // 限制缓存大小
    if (searchCache.size > 50) {
      const firstKey = searchCache.keys().next().value
      searchCache.delete(firstKey)
    }
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
  console.log(book)
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
const getFolders = async () => {
  if (!settingStore.setting.resourcePath) return
  isLoading.value = true
  try {
    // 并行加载树形数据和平铺数据
    const [treeData, flatData] = await Promise.all([
      window.book.getFolders(settingStore.setting.resourcePath, 'tree'),
      window.book.getFolders(settingStore.setting.resourcePath, 'flat')
    ])
    folderTreeData.value = [
      {
        name: '我的收藏',
        fullPath: '__favorites__',
        isLeaf: true,
        prefix: () => h(NIcon, { component: BookmarkIcon, color: '#FFD700' })
      },
      { name: '资源目录', fullPath: settingStore.setting.resourcePath, children: treeData }
    ]
    // 使用 nextTick 确保 DOM 更新不阻塞
    await nextTick()
    currentFolderList.value = flatData
    // 清空缓存
    searchCache.clear()
    currentBatch.value = 1
  } catch (error: any) {
    message.error(`获取文件夹失败: ${error.message}`)
  } finally {
    isLoading.value = false
  }
}

// 防抖搜索函数
const debouncedSearch = debounce(async (searchTerm: string) => {
  isSearching.value = true

  try {
    await nextTick() // 等待 DOM 更新

    let list = [...currentFolderList.value]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      list = list.filter((folder) => folder.name.toLowerCase().includes(term))
    }

    // 排序
    const sortFunctions = {
      name_asc: (a: FolderInfo, b: FolderInfo) => a.name.localeCompare(b.name),
      name_desc: (a: FolderInfo, b: FolderInfo) => b.name.localeCompare(a.name),
      fileCount_asc: (a: FolderInfo, b: FolderInfo) => a.fileCount - b.fileCount,
      fileCount_desc: (a: FolderInfo, b: FolderInfo) => b.fileCount - a.fileCount
    }

    const sortFn = sortFunctions[currentSortKey.value as keyof typeof sortFunctions]
    if (sortFn) {
      list.sort(sortFn)
    }

    filteredCache.value = list
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
    isShowingFavorites.value = true

    const favorites = await window.favorite.getFavorites()
    console.log('收藏书籍:', favorites)
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

    currentFolderList.value = favoriteBooks
    currentBatch.value = 1
    searchCache.clear()
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
      // 收藏节点特殊处理
      if (option.fullPath === '__favorites__') {
        getFavoriteBooks()
        return
      }

      if (option.isLeaf) return
      onTreeNodeClick(option.fullPath as string)
    }
  }
}

// 搜索输入处理
const handleSearchInput = (value: string) => {
  debouncedSearch(value)
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
  if (isLoading.value) return
  // 重置收藏状态
  isShowingFavorites.value = false
  isLoading.value = true

  try {
    // 获取该路径下的直接子文件夹
    await nextTick()
    currentFolderList.value = await window.book.getFolders(folderPath, 'flat')
    // 重置状态
    currentBatch.value = 1
    searchCache.clear()
  } catch (error) {
    message.error(`获取子文件夹失败: ${(error as Error).message}`)
  } finally {
    isLoading.value = false
  }
}

// 设置按钮回调
const settingHandleClick = () => {
  setting.open(getFolders)
}

// 页面挂载时加载数据
onMounted(async () => {
  await settingStore.updateSetting()
  getFolders()
})
</script>

<style scoped>
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

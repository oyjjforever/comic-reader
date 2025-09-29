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
          <n-button size="small">排序</n-button>
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
        <!-- 响应式虚拟网格视图 -->
        <div class="grid-view">
          <responsive-virtual-grid
            ref="virtualGridRef"
            :items="filteredFolderList"
            key-field="fullPath"
            :overscan="2"
            :min-item-width="160"
            :max-item-width="240"
            :aspect-ratio="0.75"
            :gap="24"
          >
            <template #default="{ item }">
              <comic-card
                :folder="item"
                class="grid-item"
                @click="toRead(item)"
                @contextmenu="(e) => handleContextMenu(e, item)"
              />
            </template>
          </responsive-virtual-grid>
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

    <!-- 性能监控 -->
    <performance-monitor
      v-if="showPerformanceMonitor"
      :stats="performanceStats"
      :enabled="showPerformanceMonitor"
    />
  </div>
</template>

<script setup lang="ts">
import type { FolderInfo } from '@/typings/file'
import comicCard from '@renderer/components/comic-card.vue'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import PerformanceMonitor from '@renderer/components/performance-monitor.vue'
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
const virtualGridRef = ref()
const showPerformanceMonitor = ref(false)
const resourcePath = computed(() => settingStore.setting.resourcePath)

// 性能统计
const performanceStats = computed(() => {
  if (virtualGridRef.value?.getStats) {
    return virtualGridRef.value.getStats()
  }
  return {
    renderedItems: 0,
    totalItems: filteredFolderList.value.length,
    scrollTop: 0,
    visibleRange: { start: 0, end: 0 }
  }
})

const options = [
  { label: '名称升序', key: 'name_asc' },
  { label: '名称降序', key: 'name_desc' },
  { label: '创建时间升序', key: 'createTime_asc' },
  { label: '创建时间降序', key: 'createTime_desc' }
]

const tree = reactive({ data: [], currentNode: {}, currentKey: '' })
const grid = reactive({ rows: [], filterRows: [] })
const search = reactive({ keyword: '', sort: 'name_asc' })

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
          favoriteBooks.push({ ...folderInfo, isBookmarked: true })
        }
      } catch (error) {
        console.warn(`收藏路径不存在或无法访问: ${favorite.fullPath}`)
      }
    }

    grid.rows = favoriteBooks
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



// 树节点点击事件 - 优化版本
const onTreeNodeClick = async (folderPath: string) => {
  isLoading.value = true
  tree.currentKey = folderPath
  try {
    grid.rows = await window.book.getFolders(folderPath, 'flat')
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
      { label: 'A submenu', children: [{ label: 'Item1' }, { label: 'Item2' }, { label: 'Item3' }] }
    ]
  })
}
// 切换性能监控
const togglePerformanceMonitor = () => {
  showPerformanceMonitor.value = !showPerformanceMonitor.value
}

// 键盘快捷键处理
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl/Cmd + Shift + P 切换性能监控
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
    event.preventDefault()
    togglePerformanceMonitor()
  }
}

// 页面挂载时加载数据
onMounted(async () => {
  await settingStore.updateSetting()
  fetchTreeData()
  
  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  // 清理键盘事件监听
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style lang="scss">
// SCSS 变量定义
$transition-duration: 0.3s;
$navbar-height: 64px;
$sidebar-width-full: 20%;
$sidebar-min-width: 256px;
$sidebar-width-hidden: 48px;
$grid-gap: 24px;
$border-radius: 8px;

// 主容器
.home-container {
  @apply h-full w-full flex flex-col bg-white text-gray-900;
  // transition: all $transition-duration ease;

  &.dark-mode {
    @apply bg-gray-900 text-gray-100;

    .navbar {
      @apply bg-gray-800 border-gray-700;
    }

    .sidebar {
      @apply bg-gray-800 border-gray-700;

      &-header {
        @apply border-gray-700;
      }

      &-title {
        @apply text-gray-300;
      }
    }

    .breadcrumb,
    .content-stats {
      @apply border-gray-700;
    }
  }

  // 导航栏
  .navbar {
    @apply flex items-center justify-between px-6 py-4;
    @apply bg-white border-b border-gray-200 shadow-sm;
    height: $navbar-height;
    flex-shrink: 0;

    &-left {
      @apply flex items-center gap-3;
      flex: 0 0 auto;
    }

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

  // 主内容区
  .main-content {
    @apply flex flex-1 overflow-hidden;
  }

  // 侧边栏
  .sidebar {
    @apply bg-gray-50 border-r border-gray-200 flex flex-col;
    width: $sidebar-width-full;
    min-width: $sidebar-min-width;
    // transition: all $transition-duration ease;

    &-hidden {
      width: $sidebar-width-hidden;
      min-width: $sidebar-width-hidden;

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

  // 内容区域
  .content-area {
    @apply flex-1 flex flex-col overflow-hidden;
  }

  .breadcrumb {
    @apply px-6 py-3 border-b border-gray-200;
    flex-shrink: 0;
  }

  .content-stats {
    @apply px-6 py-3 border-b border-gray-200;
    flex-shrink: 0;
  }

  // 网格视图
  .grid-view {
    @apply flex-1 overflow-hidden p-6;
  }

  .grid-item {
    // 虚拟网格项目样式由virtual-grid组件控制
  }

  // 列表视图
  .list-view {
    @apply flex-1 overflow-auto;

    .list-table {
      @apply h-full;
    }

    .list-cover {
      @apply flex items-center justify-center text-gray-400;
    }
  }

  // 加载状态
  .loading-container {
    @apply flex-1 flex items-center justify-center;
    min-height: 400px;
  }

  // 加载更多
  .load-more-container {
    @apply flex justify-center py-6;
  }

  // 空状态
  .empty-state {
    @apply flex-1 flex items-center justify-center;
  }

  // 动画效果
  .card-enter-active,
  .card-leave-active {
    transition: all $transition-duration ease;
  }

  .card-enter-from {
    opacity: 0;
    transform: translateY(20px) scale(0.9);
  }

  .card-leave-to {
    opacity: 0;
    transform: translateY(-20px) scale(0.9);
  }
}
// 响应式设计
@media (max-width: 1024px) {
  .sidebar {
    width: 25%;
    min-width: 192px;
  }
}

@media (max-width: 768px) {
  .navbar {
    @apply px-4 py-3;

    &-center {
      @apply mx-4;
    }
  }

  .sidebar {
    @apply absolute z-10 h-full;
    width: 256px;

    &-hidden {
      @apply -translate-x-full;
    }
  }

  .content-area {
    @apply w-full;
  }
}

@media (max-width: 640px) {
  .navbar {
    &-left,
    &-right {
      @apply gap-1;
    }
  }
}
</style>

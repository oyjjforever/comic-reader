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
          @input="handleSearchInput"
          @clear="handleSearchClear"
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
          <div class="sidebar-title-section">
            <div class="view-mode-toggle" v-if="!isSidebarHidden">
              <n-button-group size="small">
                <n-button
                  :type="currentViewMode === 'folders' ? 'primary' : 'default'"
                  @click="switchToFolderView"
                >
                  本地目录
                </n-button>
                <n-button
                  :type="currentViewMode === 'favorites' ? 'primary' : 'default'"
                  @click="switchToFavoritesView"
                >
                  我的收藏
                </n-button>
              </n-button-group>
            </div>
          </div>
          <n-button text size="small" @click="toggleSidebar" class="sidebar-toggle">
            <template #icon>
              <n-icon :component="isSidebarHidden ? ChevronRightIcon : ChevronLeftIcon" />
            </template>
          </n-button>
        </div>
        <div class="sidebar-content">
          <!-- 文件夹树视图 -->
          <n-tree
            v-if="currentViewMode === 'folders'"
            :data="tree.data"
            :node-props="nodeProps"
            :on-load="handleTreeLoad"
            key-field="fullPath"
            label-field="name"
            block-line
            class="folder-tree"
            :default-expanded-keys="[props.resourcePath]"
          />

          <!-- 标签树视图 -->
          <div v-else-if="currentViewMode === 'favorites'" class="tag-tree-view">
            <div class="tag-filter-header">
              <h4 class="tag-filter-title">标签筛选</h4>
              <div class="tag-filter-controls">
                <n-button size="tiny" @click="toggleAllTags">
                  {{ allTagsSelected ? '取消' : '全选' }}
                </n-button>
              </div>
            </div>
            <div class="tag-filter-list">
              <div v-if="tags.length === 0" class="empty-tags">暂无标签</div>
              <div v-else>
                <!-- 统一标签列表 -->
                <div class="tag-items">
                  <div v-for="tag in tags" :key="tag.id" class="tag-item">
                    <n-checkbox
                      :checked="selectedTagIds.includes(tag.id)"
                      @update:checked="(checked) => handleTagCheck(tag.id, checked)"
                    >
                      <template #icon v-if="tag.type === 'folder'">
                        <n-icon class="folder-icon">
                          <folder-icon />
                        </n-icon>
                      </template>
                      {{ tag.label }}
                    </n-checkbox>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="content-area">
        <div class="grid-view">
          <responsive-virtual-grid
            ref="virtualGridRef"
            :items="grid.filterRows"
            key-field="fullPath"
            :overscan="3"
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
  ChevronForwardOutline as ChevronRightIcon,
  Folder as FolderIcon
} from '@vicons/ionicons5'
import { ArrowSortDownLines24Regular } from '@vicons/fluent'
import { NButton, NIcon, NCheckbox, NButtonGroup, useMessage } from 'naive-ui'
import { debounce } from 'lodash'
import { ref, reactive, onMounted, onActivated, onDeactivated, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
const currentViewMode = ref<'folders' | 'favorites'>('favorites')

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

// 标签筛选相关状态
const showTagFilter = ref(false)
const tags = ref<any[]>([])
const selectedTagIds = ref<number[]>([])
const allTagsSelected = ref(true)
const originalFavorites = ref<FolderInfo[]>([])

// 侧边栏折叠
const toggleSidebar = () => {
  isSidebarHidden.value = !isSidebarHidden.value
}

// 切换到文件夹视图
const switchToFolderView = () => {
  currentViewMode.value = 'folders'
  grid.filterRows = []
  // 选中资源目录节点
  if (props.resourcePath) {
    if (!tree.data?.length) {
      fetchTreeData()
    }
    onTreeNodeClick(props.resourcePath)
    tree.currentKey = props.resourcePath
  }
}

// 切换到收藏夹视图
const switchToFavoritesView = () => {
  currentViewMode.value = 'favorites'
  grid.filterRows = []
  // 加载收藏夹数据
  getFavorites()
}

// 处理搜索输入
const handleSearchInput = (value: string) => {
  search.keyword = value
  debounceQuery()
}

// 处理搜索清空
const handleSearchClear = () => {
  search.keyword = ''
  debounceQuery()
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
    if (dataCache.currentPath === '__favorites__') {
      list = list.filter((folder) => {
        return (
          !folder.tags?.length || folder.tags?.some((tagId) => selectedTagIds.value.includes(tagId))
        )
      })
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
      currentViewMode.value = 'folders'
      tree.currentNode = option
      onTreeNodeClick(option.fullPath as string)
    },
    onContextmenu(e: MouseEvent) {
      e.preventDefault()
      handleFolderContextMenu(e, option)
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

    // 加载标签列表
    await loadTags()
    // 确保视图模式设置为收藏夹
    currentViewMode.value = 'favorites'
  } catch (error: any) {
    message.error(`获取收藏失败: ${error.message}`)
    dataCache.isDataLoaded = false
  } finally {
    isLoading.value = false
  }
}

// 加载所有标签
const loadTags = async () => {
  try {
    tags.value = await window.tag.getTags()

    // 默认全选所有标签
    selectedTagIds.value = [] ///tags.value.map((tag) => tag.id)
    allTagsSelected.value = false
  } catch (error: any) {
    console.error('加载标签失败:', error)
    message.error('加载标签失败')
  }
}

// 处理标签选择
const handleTagCheck = async (tagId: number, checked: boolean) => {
  if (checked) {
    if (!selectedTagIds.value.includes(tagId)) {
      selectedTagIds.value.push(tagId)
    }
  } else {
    const index = selectedTagIds.value.indexOf(tagId)
    if (index > -1) {
      selectedTagIds.value.splice(index, 1)
    }
  }

  // 更新全选状态
  allTagsSelected.value = selectedTagIds.value.length === tags.value.length

  // 应用标签筛选
  await applyTagFilter()
}

// 全选/反选标签
const toggleAllTags = () => {
  if (allTagsSelected.value) {
    // 反选
    selectedTagIds.value = []
    allTagsSelected.value = false
  } else {
    // 全选
    selectedTagIds.value = tags.value.map((tag) => tag.id)
    allTagsSelected.value = true
  }

  // 应用标签筛选
  debounceQuery()
}

// 应用标签筛选
const applyTagFilter = async () => {
  if (dataCache.currentPath !== '__favorites__') return

  try {
    if (selectedTagIds.value.length === 0) {
      // 没有选择任何标签，显示空列表
      grid.filterRows = []
      return
    }

    // 获取所有选中的标签信息
    debugger
    const selectedTagsInfo = await window.tag.getTagsByIds(selectedTagIds.value.join(','))

    // 分离文件夹标签和普通标签
    const folderTags = selectedTagsInfo.filter((tag) => tag.type === 'folder')
    const normalTags = selectedTagsInfo.filter((tag) => tag.type === 'normal')

    let allItems: any[] = []

    // 处理文件夹标签：获取每个文件夹标签下的所有作品
    for (const folderTag of folderTags) {
      if (folderTag.folderPath) {
        const folderItems = await window.media.getFolderListBasic(folderTag.folderPath)
        loadDetailsProgressively(folderItems)
        allItems = allItems.concat(folderItems)
      }
    }

    // 处理普通标签：获取收藏列表并筛选
    if (normalTags.length > 0) {
      const favorites = await window.favorite.getFavorites('id DESC', 'book')

      for (const favorite of favorites) {
        // 获取收藏的标签
        const favoriteTags = await window.favorite.getFavoriteTags(favorite.id)
        const favoriteTagIds = favoriteTags.map((tag) => tag.id)

        // 检查是否包含所有选中的普通标签
        const hasAllSelectedNormalTags = normalTags.every((tag) => favoriteTagIds.includes(tag.id))

        if (hasAllSelectedNormalTags) {
          // 添加收藏信息
          const favInfo = await window.media.getFolderInfo(favorite.fullPath)
          allItems.push({ ...favorite, ...favInfo, isBookmarked: true })
        }
      }
    }

    // 去重（基于fullPath）
    const uniqueItems = allItems.filter(
      (item, index, self) => index === self.findIndex((t) => t.fullPath === item.fullPath)
    )

    // 更新显示内容
    grid.filterRows = grid.rows = uniqueItems

    // 更新当前路径标识
    dataCache.currentPath = '__tag_filtered__'
    dataCache.isDataLoaded = true
    dataCache.lastLoadTime = Date.now()

    // 滚动到顶部
    virtualGridRef.value?.scrollToTop()
  } catch (error: any) {
    console.error('应用标签筛选失败:', error)
    message.error('应用标签筛选失败')
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
    tree.data = [{ name: '资源目录', fullPath: props.resourcePath, children: treeData }]
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

// 文件夹右键菜单
async function handleFolderContextMenu(e: MouseEvent, folder: any) {
  e.preventDefault()

  try {
    // 检查文件夹是否已被收藏为标签
    const isFolderTagged = await window.tag.isFolderTagged(folder.fullPath)

    ContextMenu.showContextMenu({
      x: e.x,
      y: e.y,
      items: [
        {
          label: isFolderTagged ? '取消收藏为标签' : '收藏为标签',
          onClick: async () => {
            try {
              if (isFolderTagged) {
                // 取消收藏为标签
                const tag = await window.tag.getTagByFolderPath(folder.fullPath)
                if (tag && tag.id) {
                  await window.tag.deleteTag(tag.id)
                  message.success('已取消收藏为标签')
                }
              } else {
                // 收藏为标签
                const folderName = folder.name || folder.label || '未命名文件夹'
                await window.tag.addFolderTag(folderName, folder.fullPath)
                message.success('已收藏为标签')
              }
            } catch (error: any) {
              message.error(`操作失败: ${error.message || error}`)
            }
          }
        }
      ]
    })
  } catch (error: any) {
    message.error(`操作失败: ${error.message || error}`)
  }
}

// 事件与生命周期
onMounted(async () => {
  switchToFavoritesView()
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
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  color: #111827;
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  padding-top: 1rem;
  padding-bottom: 1rem;
  background-color: #ffffff;
  border-bottom-width: 1px;
  border-bottom-color: #e5e7eb;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  height: 64px;
  flex-shrink: 0;

  &-center {
    flex: 1 1 0%;
    max-width: 28rem;
    margin-left: 1.5rem;
    margin-right: 1.5rem;

    .search-input {
      width: 100%;
    }
  }

  &-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
  }
}

.main-content {
  display: flex;
  flex: 1 1 0%;
  overflow: hidden;
}

.sidebar {
  background-color: #f9fafb;
  border-right-width: 1px;
  border-right-color: #e5e7eb;
  display: flex;
  flex-direction: column;
  width: 20%;
  min-width: 256px;

  &-hidden {
    width: 48px;
    min-width: 48px;

    .sidebar-title,
    .sidebar-content {
      display: none;
    }
  }

  &-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: 1rem;
    padding-right: 1rem;
    padding-top: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom-width: 1px;
    border-bottom-color: #e5e7eb;
    flex-shrink: 0;
  }

  &-title-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
  }

  &-title {
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
    color: #374151;
    margin: 0;
  }

  &-content {
    flex: 1 1 0%;
    overflow: auto;
    padding: 0.5rem;
  }
}

.folder-tree {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.content-area {
  flex: 1 1 0%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.grid-view {
  flex: 1 1 0%;
  overflow: hidden;
  padding: 0.75rem;
}

.empty-state {
  flex: 1 1 0%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 标签树视图样式 */
.tag-tree-view {
  padding: 0.5rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tag-filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}

.tag-filter-title {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  color: #374151;
  margin: 0;
}

.tag-filter-controls {
  display: flex;
  align-items: center;
}

.tag-filter-list {
  flex: 1;
  overflow: auto;
}

.empty-tags {
  text-align: center;
  color: #6b7280;
  padding-top: 1rem;
  padding-bottom: 1rem;
}

.tag-items {
  & > :not([hidden]) ~ :not([hidden]) {
    margin-top: 0.5rem;
  }
}

/* 文件夹标签样式 */
.tag-section {
  margin-bottom: 1rem;
}

.tag-section-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.5rem;
  padding-left: 0.25rem;
}

.folder-tag {
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f3f4f6;
    border-radius: 4px;
  }
}

.folder-tag-content {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  width: 100%;
}

.folder-icon {
  margin-right: 0.5rem;
  color: #3b82f6;
}

.folder-tag-label {
  font-weight: 500;
}
</style>

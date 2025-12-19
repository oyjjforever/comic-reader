<template>
  <div class="home-container">
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
                  收藏
                </n-button>
                <n-button
                  :type="currentViewMode === 'history' ? 'primary' : 'default'"
                  @click="switchToHistoryView"
                >
                  浏览历史
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
            :render-label="renderTreeNode"
          />

          <!-- 标签树视图 -->
          <div v-else-if="currentViewMode === 'favorites'" class="tag-tree-view">
            <div class="tag-filter-header">
              <h4 class="tag-filter-title">
                标签筛选
                <n-tooltip trigger="hover">
                  左键单选，右键多选
                  <template #trigger>
                    <n-icon :component="QuestionCircle24Regular" size="12" />
                  </template>
                </n-tooltip>
              </h4>

              <div class="tag-filter-controls">
                <n-button size="tiny" @click="openTagManager"> 管理 </n-button>
                <n-button size="tiny" @click="toggleAllTags">
                  {{ allTagsSelected ? '取消全选' : '全选' }}
                </n-button>
              </div>
            </div>
            <div class="tag-filter-list">
              <div v-if="tags.length === 0" class="empty-tags">暂无标签</div>
              <div v-else>
                <!-- 统一标签列表 -->
                <div class="tag-items">
                  <div
                    v-for="tag in tags"
                    :key="tag.id"
                    class="tag-item"
                    :class="{ 'tag-selected': selectedTagIds.includes(tag.id) }"
                    @click="handleTagLeftClick(tag)"
                    @contextmenu.prevent="handleTagRightClick(tag, $event)"
                  >
                    <div class="tag-item-content">
                      <n-icon
                        :component="tag.type === 'folder' ? Folder24Regular : Tag20Regular"
                        class="folder-icon"
                        :size="16"
                      />

                      <span class="tag-label">{{ tag.label }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="content-area">
        <div class="grid-view">
          <div v-if="grid.filterRows.length === 0" class="empty-data-state">
            <n-empty description="没有找到匹配的内容"> </n-empty>
          </div>
          <responsive-virtual-grid
            v-else
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
              <div
                style="width: 100%; height: 100%"
                @contextmenu="(e) => handleContextMenu(e, item)"
              >
                <slot name="card" :item="item" />
              </div>
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

    <!-- 标签对话框 -->
    <tag-dialog
      v-if="tagDialogObject.show"
      v-model:show="tagDialogObject.show"
      :media-path="tagDialogObject.data.fullPath"
      :media-name="tagDialogObject.data.name"
      :mode="tagDialogObject.mode"
      :namespace="namespace"
      @change="onTagsChange"
      @confirm="applyTagFilter"
    />
  </div>
</template>

<script setup lang="ts">
import type { FolderInfo } from '@/typings/file'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import TagDialog from '@renderer/components/tag-dialog.vue'
import ContextMenu from '@imengyu/vue3-context-menu'
import {
  Bookmark as BookmarkIcon,
  Search as SearchIcon,
  ChevronBackOutline as ChevronLeftIcon,
  ChevronForwardOutline as ChevronRightIcon,
  Folder as FolderIcon,
  Settings as SettingsIcon
} from '@vicons/ionicons5'
import {
  ArrowSortDownLines24Regular,
  QuestionCircle24Regular,
  Folder24Regular,
  Tag20Regular
} from '@vicons/fluent'
import { NButton, NIcon, NCheckbox, NButtonGroup, useMessage } from 'naive-ui'
import { debounce } from 'lodash'
import { ref, reactive, onMounted, onActivated, onDeactivated, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingStore } from '@renderer/plugins/store'

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
  // 命名空间，用于区分不同模块的标签集合
  namespace?: string
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
  gridGap: 1,
  namespace: 'default'
})

const message = useMessage()
const router = useRouter()
const settingStore = useSettingStore()
const isSidebarHidden = ref(false)
const currentViewMode = ref<'folders' | 'favorites' | 'history'>(
  settingStore.setting.defaultViewMode || 'favorites'
)

// 性能优化
const isLoading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const virtualGridRef = ref()

// 标签筛选加载状态
const isTagFilterLoading = ref(false)

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

const tags = ref<any[]>([])
const selectedTagIds = ref<number[]>([])
const allTagsSelected = ref(false)
const tagDialogObject = reactive({ show: false, data: {} as FolderInfo | null })

// 侧边栏折叠
const toggleSidebar = () => {
  isSidebarHidden.value = !isSidebarHidden.value
}

// 切换到文件夹视图
const switchToFolderView = () => {
  currentViewMode.value = 'folders'
  grid.filterRows = grid.rows = []
  // 选中资源目录节点
  if (props.resourcePath) {
    if (!tree.data?.length) {
      fetchTreeData()
    }
    fetchGridData(props.resourcePath)
    tree.currentKey = props.resourcePath
  }
}

// 切换到收藏夹视图
const switchToFavoritesView = () => {
  currentViewMode.value = 'favorites'
  grid.filterRows = grid.rows = []
  // 加载收藏夹数据
  getFavorites()
}

// 切换到浏览历史视图
const switchToHistoryView = async () => {
  currentViewMode.value = 'history'
  grid.filterRows = grid.rows = []
  // 加载浏览历史数据
  await getBrowseHistory()
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
      fetchGridData(option.fullPath as string)
    },
    onContextmenu(e: MouseEvent) {
      e.preventDefault()
      handleFolderContextMenu(e, option)
    }
  }
}

// 渲染树节点
const renderTreeNode = ({ option }: { option: any }) => {
  return h('div', { class: 'tree-node-content' }, [
    option.isBookmarked
      ? h(NIcon, { component: BookmarkIcon, class: 'bookmark-icon', size: 16 })
      : null,
    h('span', { class: 'tree-node-label' }, option.name)
  ])
}
// 懒加载处理
const handleTreeLoad = (node: any) => {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await props.provideTree(node.fullPath)

      // 检查每个子节点是否已被收藏
      for (const childNode of res) {
        try {
          childNode.isBookmarked = await window.tag.isFolderTagged(
            childNode.fullPath,
            props.namespace
          )
        } catch (error) {
          console.warn(`Failed to check bookmark status for ${childNode.fullPath}:`, error)
          childNode.isBookmarked = false
        }
      }

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
    dataCache.currentPath = favoritesPath
    dataCache.isDataLoaded = true
    dataCache.lastLoadTime = Date.now()
    virtualGridRef.value?.scrollToTop()

    // 加载标签列表
    await loadTags()
    // 如果没有标签被选中，则默认全选
    // if (tags.value.length && !selectedTagIds.value.length) {
    //   selectedTagIds.value = tags.value.map((tag) => tag.id)
    //   allTagsSelected.value = true
    // }
    applyTagFilter()
  } catch (error: any) {
    message.error(`获取收藏失败: ${error.message}`)
    dataCache.isDataLoaded = false
  } finally {
    isLoading.value = false
  }
}

// 获取浏览历史
const getBrowseHistory = async () => {
  const historyPath = '__history__'
  if (dataCache.currentPath === historyPath && dataCache.isDataLoaded) {
    return
  }

  try {
    isLoading.value = true
    dataCache.currentPath = historyPath
    dataCache.isDataLoaded = true
    dataCache.lastLoadTime = Date.now()
    virtualGridRef.value?.scrollToTop()

    // 获取浏览历史记录
    const historyRecords = await window.browseHistory.getBrowseHistory(100, props.namespace)

    // 转换为FolderInfo格式
    const historyFolders: FolderInfo[] = []
    for (const record of historyRecords) {
      try {
        let folderInfo
        // TODO 不够优雅的区分方式，后续考虑改进
        if (props.provideList) {
          folderInfo = await window.media.getFileInfo(record.fullPath)
          folderInfo.coverPath = folderInfo.fullPath
        } else {
          folderInfo = await window.media.getFolderInfo(record.fullPath)
        }
        if (folderInfo) {
          historyFolders.push({
            ...folderInfo,
            fullPath: record.fullPath,
            isBookmarked: false
          })
        }
      } catch (error) {
        console.warn(`Failed to load folder info for ${record.fullPath}:`, error)
        // 即使获取详细信息失败，也添加基本信息
        const pathParts = record.fullPath.split(/[/\\]/)
        const name = pathParts[pathParts.length - 1] || record.fullPath
        historyFolders.push({
          name,
          fullPath: record.fullPath,
          fileCount: 0,
          createdTime: new Date(record.created_at || Date.now()),
          isBookmarked: false,
          contentType: 'empty'
        })
      }
    }

    grid.filterRows = grid.rows = historyFolders
  } catch (error: any) {
    message.error(`获取浏览历史失败: ${error.message}`)
    dataCache.isDataLoaded = false
  } finally {
    isLoading.value = false
  }
}
const onTagsChange = async () => {
  if (currentViewMode.value === 'favorites') {
    await loadTags()
    applyTagFilter()
  }
}
// 加载所有标签
const loadTags = async () => {
  try {
    tags.value = await window.tag.getTags('sort_order ASC', props.namespace)
    selectedTagIds.value = selectedTagIds.value.filter((tagId) =>
      tags.value.some((tag) => tag.id === tagId)
    )
  } catch (error: any) {
    message.error('加载标签失败')
  }
}

// 检查标签筛选加载状态并提示用户
const checkTagFilterLoading = () => {
  if (isTagFilterLoading.value) {
    message.warning('标签筛选正在进行中，请稍候...')
    return true
  }
  return false
}

// 处理标签左键点击（单选）
const handleTagLeftClick = async (tag: any) => {
  // 如果正在加载中，提示用户并忽略操作
  if (checkTagFilterLoading()) return

  // 如果当前已选中该标签，则取消选中
  // if (selectedTagIds.value.includes(tag.id)) {
  //   selectedTagIds.value = []
  // } else {
  // 否则只选中当前点击的标签
  selectedTagIds.value = [tag.id]
  // }

  // 更新全选状态
  allTagsSelected.value = selectedTagIds.value.length === tags.value.length

  // 应用标签筛选
  applyTagFilter()
}

// 处理标签右键点击（多选）
const handleTagRightClick = async (tag: any, event: MouseEvent) => {
  event.preventDefault()

  // 如果正在加载中，提示用户并忽略操作
  if (checkTagFilterLoading()) return

  // 切换当前标签的选中状态
  if (selectedTagIds.value.includes(tag.id)) {
    const index = selectedTagIds.value.indexOf(tag.id)
    if (index > -1) {
      selectedTagIds.value.splice(index, 1)
    }
  } else {
    selectedTagIds.value.push(tag.id)
  }

  // 更新全选状态
  allTagsSelected.value = selectedTagIds.value.length === tags.value.length

  // 应用标签筛选
  applyTagFilter()
}

// 全选/反选标签
const toggleAllTags = async () => {
  // 如果正在加载中，提示用户并忽略操作
  if (checkTagFilterLoading()) return

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
  applyTagFilter()
}

// 应用标签筛选
const applyTagFilter = debounce(async () => {
  if (currentViewMode.value !== 'favorites') return
  // 如果正在加载中，忽略操作
  if (isTagFilterLoading.value) return

  try {
    isTagFilterLoading.value = true

    if (selectedTagIds.value.length === 0) {
      // 没有选择任何标签，显示空列表
      grid.filterRows = []
      return
    }

    // 获取所有选中的标签信息
    const selectedTagsInfo = await window.tag.getTagsByIds(
      selectedTagIds.value.join(','),
      props.namespace
    )

    // 分离文件夹标签和普通标签
    const folderTags = selectedTagsInfo.filter((tag) => tag.type === 'folder')
    const normalTags = selectedTagsInfo.filter((tag) => tag.type === 'normal')

    let allItems: any[] = []

    // 处理文件夹标签：获取每个文件夹标签下的所有作品
    for (const folderTag of folderTags) {
      if (folderTag.folderPath) {
        const folderItems = await window.media.getFolderListBasic(folderTag.folderPath)
        allItems = allItems.concat(folderItems)
        await loadDetailsProgressively(allItems, folderItems)
      }
    }

    // 处理普通标签：获取收藏列表并筛选
    if (normalTags.length > 0) {
      // 使用props.namespace作为module参数
      const favorites = await window.favorite.getFavorites('id DESC', props.namespace || 'default')

      for (const favorite of favorites) {
        // 获取收藏的标签
        const favoriteTags = await window.favorite.getFavoriteTags(favorite.id)
        const favoriteTagIds = favoriteTags.map((tag) => tag.id)

        // 检查是否包含所有选中的普通标签
        const hasAllSelectedNormalTags = normalTags.some((tag) => favoriteTagIds.includes(tag.id))

        if (hasAllSelectedNormalTags) {
          // 添加收藏信息
          const favInfo =
            props.namespace === 'video'
              ? await window.media.getFileInfo(favorite.fullPath)
              : await window.media.getFolderInfo(favorite.fullPath)
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
    // 滚动到顶部
    virtualGridRef.value?.scrollToTop()
  } catch (error: any) {
    console.log('🚀 应用标签筛选失败 error:', error)
    message.error('应用标签筛选失败')
  } finally {
    isTagFilterLoading.value = false
  }
}, 500)

// 打开标签管理对话框
const openTagManager = () => {
  tagDialogObject.data = {
    fullPath: '',
    name: '标签管理'
  }
  tagDialogObject.mode = 'manage'
  tagDialogObject.show = true
}

// 缓存（keep-alive）
const dataCache = reactive({
  currentPath: '',
  isDataLoaded: false,
  lastLoadTime: 0
})

// 树节点点击
const fetchGridData = async (folderPath: string) => {
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
      // 第二阶段：渐进式加载详细信息
      loadDetailsProgressively(grid.rows, basicFolders)
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
const loadDetailsProgressively = async (rows: any[], folders: any[]) => {
  const batchSize = Math.min(10, folders.length) // 每批处理10个文件夹
  for (let i = 0; i < folders.length; i += batchSize) {
    const batch = folders.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (folder) => {
        try {
          const details = await window.media.loadFolderDetails(folder.fullPath)
          // 更新对应的文件夹信息
          const index = rows.findIndex((f) => f.fullPath === folder.fullPath)
          if (index !== -1) {
            rows[index] = { ...rows[index], ...details }
          }
        } catch (error) {
          console.warn(`Failed to load details for ${folder.fullPath}:`, error)
        }
      })
    )
    // 每批处理后短暂暂停，避免阻塞UI
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
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
  if (currentViewMode === 'favorites') return
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

    // 检查每个顶层节点是否已被收藏
    for (const node of treeData) {
      try {
        node.isBookmarked = await window.tag.isFolderTagged(node.fullPath, props.namespace)
      } catch (error) {
        console.warn(`Failed to check bookmark status for ${node.fullPath}:`, error)
        node.isBookmarked = false
      }
    }

    tree.data = [{ name: '资源目录', fullPath: props.resourcePath, children: treeData }]
    fetchGridData(props.resourcePath as string)
  } catch (error: any) {
    message.error(`获取文件夹失败: ${error.message}`)
  } finally {
    isLoading.value = false
  }
}

// 右键菜单
async function handleContextMenu(e: MouseEvent, folder: FolderInfo) {
  e.preventDefault()

  // 检查文件夹是否已被收藏
  const isFavorited = await window.favorite.isFavorited(folder.fullPath, props.namespace)

  // 否则显示默认菜单
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    theme: 'mac',
    items: [
      {
        label: isFavorited ? '修改标签' : '添加到收藏',
        onClick: () => {
          // 直接在组件内部处理标签对话框
          tagDialogObject.data = folder
          tagDialogObject.mode = 'assign'
          tagDialogObject.show = true
        }
      },
      {
        label: '在文件管理器中打开',
        onClick: () => {
          window.systemInterface.openExplorer(folder.fullPath)
        }
      },
      {
        label: '删除',
        onClick: () => {
          // 显示确认对话框
          if (
            confirm(
              `确定要删除文件夹"${folder.name}"吗？\n\n此操作不可撤销，文件夹及其所有内容将被永久删除。`
            )
          ) {
            // 调用删除函数
            window.systemInterface.deleteFolder(folder.fullPath).then((success: boolean) => {
              if (success) {
                message.success(`文件夹"${folder.name}"已成功删除`)
                // 刷新资源浏览器
                refresh()
              } else {
                message.error(`删除文件夹"${folder.name}"失败`)
              }
            })
          }
        }
      }
    ]
  })
}

// 文件夹右键菜单
async function handleFolderContextMenu(e: MouseEvent, folder: any) {
  e.preventDefault()

  try {
    // 检查文件夹是否已被收藏为标签
    const isFolderTagged = await window.tag.isFolderTagged(folder.fullPath, props.namespace)

    ContextMenu.showContextMenu({
      x: e.x,
      y: e.y,
      theme: 'mac',
      items: [
        {
          label: isFolderTagged ? '取消收藏' : '添加到收藏',
          onClick: async () => {
            try {
              if (isFolderTagged) {
                // 取消收藏为标签
                const tag = await window.tag.getTagByFolderPath(folder.fullPath, props.namespace)
                if (tag && tag.id) {
                  await window.tag.deleteTag(tag.id)
                  message.success('已取消收藏为标签')
                  // 更新节点状态
                  updateNodeBookmarkStatus(folder.fullPath, false)
                }
              } else {
                // 收藏为标签
                const folderName = folder.name || folder.label || '未命名文件夹'
                await window.tag.addFolderTag(folderName, folder.fullPath, props.namespace)
                message.success('已收藏为标签')
                // 更新节点状态
                updateNodeBookmarkStatus(folder.fullPath, true)
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

// 更新节点收藏状态
const updateNodeBookmarkStatus = (folderPath: string, isBookmarked: boolean) => {
  // 递归查找并更新树中匹配的节点
  const updateNodeInTree = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.fullPath === folderPath) {
        node.isBookmarked = isBookmarked
        return true // 找到并更新了节点
      }
      if (node.children && updateNodeInTree(node.children)) {
        return true // 在子节点中找到并更新了
      }
    }
    return false // 未找到匹配的节点
  }

  // 更新树数据
  updateNodeInTree(tree.data)
}

// 事件与生命周期
onMounted(async () => {
  // 根据设置中的默认视图模式初始化
  switch (settingStore.setting.defaultViewMode) {
    case 'folders':
      await switchToFolderView()
      break
    case 'history':
      await switchToHistoryView()
      break
    case 'favorites':
    default:
      await switchToFavoritesView()
      break
  }
})

// 暴露方法
defineExpose({
  scrollToTop: () => virtualGridRef.value?.scrollToTop(),
  scrollToIndex: (index: number) => virtualGridRef.value?.scrollToIndex(index),
  saveScrollPosition: () => virtualGridRef.value?.saveScrollPosition(),
  restoreScrollPosition: () => virtualGridRef.value?.restoreScrollPosition(),
  getScrollPosition: () => virtualGridRef.value?.getScrollPosition() || 0,
  setScrollPosition: (position: number) => virtualGridRef.value?.setScrollPosition(position),
  getStats: () => virtualGridRef.value?.getStats(),
  onTagsChange,
  fetchGridData
})
</script>

<style lang="scss">
/* 复用原页面的样式类名以避免大面积改动 */
.home-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  color: #111827;

  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    background-color: #ffffff;
    border-bottom-width: 1px;
    border-bottom-color: #e5e7eb;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    height: 64px;
    flex-shrink: 0;

    &-center {
      flex: 1 1 0%;
      max-width: 28rem;

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
    // border-right-width: 1px;
    // border-right-color: #e5e7eb;
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

  .empty-data-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    padding: 2rem;
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
    gap: 8px;
  }

  .hint-text {
    white-space: nowrap;
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
      margin-top: 4px;
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
    // margin-right: 2px;
    color: #aaa;
  }

  .folder-tag-label {
    font-weight: 500;
  }

  /* 树节点图标样式 */
  .tree-node-content {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bookmark-icon {
    color: #f59e0b;
    flex-shrink: 0;
  }

  .tree-node-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 标签项样式 */
  .tag-item {
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.2s;
    user-select: none;

    &:hover {
      background-color: #f3f4f6;
    }

    &.tag-selected {
      background-color: #04f70416;
      border-left: 3px solid #18a058;
    }
  }

  .tag-item-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .tag-label {
    flex: 1;
    margin-left: 0.5rem;
  }
}
</style>

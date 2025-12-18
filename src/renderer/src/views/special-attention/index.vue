<template>
  <div class="page-container">
    <div class="content-container">
      <!-- 页面标题与搜索区域 -->
      <div class="header-section">
        <h1 class="page-title">特别关注({{ filteredItems.length }})</h1>
        <!-- 新作品提示 -->
        <div v-if="newArtworkCount > 0" class="new-artwork-notification">
          <n-icon :component="Alert24Regular" size="18" />
          <span>发现 {{ newArtworkCount }} 位作者有新作品</span>
          <div class="notification-buttons">
            <n-button size="tiny" @click="toggleOnlyNewArtworks">{{
              showOnlyNew ? '显示全部' : '只显示更新'
            }}</n-button>
            <n-button size="tiny" @click="clearAllNewArtworkMarks">清除标记</n-button>
          </div>
        </div>
        <div class="search-controls">
          <n-input
            v-model:value="searchQuery"
            type="text"
            size="small"
            clearable
            placeholder="请输入作者名称进行搜索"
          />
          <div class="control-buttons">
            <n-select
              v-model:value="sourceFilter"
              :options="sourceOptions"
              size="small"
              placeholder="类型"
              style="width: 120px"
            />
            <n-button type="primary" size="small" @click="refresh">刷新</n-button>
          </div>
        </div>

        <!-- 标签筛选区域 -->
        <div class="tag-filter-section">
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
              <n-button size="tiny" @click="openTagManager">管理</n-button>
              <n-button size="tiny" @click="toggleAllTags">
                {{ allTagsSelected ? '取消全选' : '全选' }}
              </n-button>
            </div>
          </div>
          <div class="tag-filter-list">
            <div v-if="tags.length === 0" class="empty-tags">暂无标签</div>
            <div v-else>
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
      <ResponsiveVirtualGrid
        ref="virtualGridRef"
        :items="filteredItems"
        :min-item-width="560"
        :max-item-width="630"
        :aspect-ratio="2.5"
        :gap="20"
        :overscan="0"
        :draggable="true"
        key-field="id"
        mode="lazy"
        @sort-change="handleSortChange"
      >
        <template #default="{ item, index }">
          <AuthorCard
            :item="item"
            @remove="onRemove"
            @dragstart="(event) => handleDragStart(index, event)"
            @dragend="handleDragEnd"
            @set-tag="handleSetTag"
          />
        </template>
      </ResponsiveVirtualGrid>
    </div>

    <!-- 标签对话框 -->
    <tag-dialog
      v-if="tagDialogObject.show"
      v-model:show="tagDialogObject.show"
      :media-path="tagDialogObject.data.fullPath || ''"
      :media-name="tagDialogObject.data.name || ''"
      :mode="tagDialogObject.mode"
      :namespace="namespace"
      @change="onTagsChange"
      @confirm="refresh"
    />
  </div>
</template>
<script lang="ts" setup name="specialAttention">
import AuthorCard from './author-card.vue'
import { NButton, NInput, NSelect, useMessage, NIcon, NTooltip } from 'naive-ui'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import TagDialog from '@renderer/components/tag-dialog.vue'
import {
  Alert24Regular,
  QuestionCircle24Regular,
  Folder24Regular,
  Tag20Regular
} from '@vicons/fluent'
import { useNewArtworkDetectorStore } from '@renderer/plugins/store/newArtworkDetector'
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import { debounce } from 'lodash'
const message = useMessage()

// 使用新作品检测store
const newArtworkDetector = useNewArtworkDetectorStore()

const sourceOptions = [
  { label: '全部', value: null },
  { label: 'pixiv', value: 'pixiv' },
  { label: 'jmtt', value: 'jmtt' },
  { label: 'twitter', value: 'twitter' }
]

// 虚拟滚动网格引用
const virtualGridRef = ref()

// 排序选项
const sortOptions = [
  { label: '按名称排序', value: 'name' },
  { label: '按关注时间排序', value: 'followedAt' },
  { label: '按作品数量排序', value: 'worksCount' }
]

const items = ref([])
const searchQuery = ref('')
const sourceFilter = ref(null)
const showOnlyNew = ref(false)

// 标签相关变量
const tags = ref<any[]>([])
const selectedTagIds = ref<number[]>([])
const allTagsSelected = ref(false)
const tagDialogObject = reactive({ show: false, data: {} as any, mode: 'manage' })
const namespace = 'attention' // 特别关注模块的命名空间

// 新作品数量
const newArtworkCount = computed(() => {
  return newArtworkDetector.newArtworkCount
})
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return items.value.filter((u) => {
    const matchName =
      !q ||
      (u.authorName || '').toLowerCase().includes(q) ||
      (u.authorId || '').toLowerCase().includes(q)
    const matchSource = !sourceFilter.value || u.source === sourceFilter.value

    // 如果启用了"只显示新作品"，则只显示有新作品的作者
    const hasNewArtwork = newArtworkDetector.hasNewArtwork(u.source, u.authorId)
    const showItem = !showOnlyNew.value || hasNewArtwork

    // 标签筛选
    const matchTags =
      selectedTagIds.value.length === 0 ||
      (u.tags && selectedTagIds.value.some((tagId) => u.tags.includes(tagId)))

    return matchName && matchSource && showItem && matchTags
  })
})
async function refresh() {
  const list = await window.specialAttention.list()

  // 为每个作者加载标签信息
  for (const item of list) {
    try {
      // 使用source:authorId作为唯一标识
      const identifier = `${item.source}:${item.authorId}`
      const isFavorited = await window.favorite.isFavorited(identifier, namespace)
      console.log('🚀 ~ refresh ~ isFavorited:', identifier, isFavorited)

      if (isFavorited) {
        // 获取收藏信息
        const favorites = await window.favorite.getFavorites('id DESC', namespace)
        const currentFavorite = favorites.find((fav) => fav.fullPath === identifier)

        if (currentFavorite && currentFavorite.id) {
          // 获取收藏的标签
          const favoriteTags = await window.favorite.getFavoriteTags(currentFavorite.id)
          item.tags = favoriteTags.map((tag) => tag.id)
        }
      } else {
        item.tags = []
      }
    } catch (error) {
      console.warn(`Failed to load tags for ${item.source}:${item.authorId}:`, error)
      item.tags = []
    }
  }

  items.value = list
}
async function onRemove(id: number) {
  await window.specialAttention.remove(id)
  message.success('取消关注成功')
  await refresh()
}

// 拖动事件处理
const draggedIndex = ref<number | null>(null)

function handleDragStart(index: number, event: DragEvent) {
  draggedIndex.value = index

  // 调用 virtual-grid 的 handleDragStart 方法
  if (virtualGridRef.value && virtualGridRef.value.handleDragStart) {
    virtualGridRef.value.handleDragStart(index, event)
  }
}

function handleDragEnd() {
  draggedIndex.value = null

  // 调用 virtual-grid 的 handleDragEnd 方法
  if (virtualGridRef.value && virtualGridRef.value.handleDragEnd) {
    virtualGridRef.value.handleDragEnd()
  }
}

async function handleSortChange(fromIndex: number, toIndex: number) {
  const fromItem = filteredItems.value[fromIndex]
  const toItem = filteredItems.value[toIndex]

  if (fromItem && toItem && fromItem.id !== toItem.id) {
    try {
      // 使用 swapPriority 方法直接交换两个项目的优先级
      const success = await window.specialAttention.swapPriority(fromItem.id, toItem.id)
      if (success) {
        await refresh()
        message.success(`交换成功`)
      } else {
        message.error('排序失败，请重试')
      }
    } catch (error) {
      console.error('排序失败:', error)
      message.error('排序失败，请重试')
    }
  }
}

// 清除所有新作品标记
function clearAllNewArtworkMarks() {
  newArtworkDetector.clearAllNewArtworkMarks()
  showOnlyNew.value = false
  message.success('已清除所有新作品标记')
}

// 只显示有新作品的作者
function toggleOnlyNewArtworks() {
  showOnlyNew.value = !showOnlyNew.value
}

// 加载所有标签
const loadTags = async () => {
  try {
    tags.value = await window.tag.getTags('sort_order ASC', namespace)
    selectedTagIds.value = selectedTagIds.value.filter((tagId) =>
      tags.value.some((tag) => tag.id === tagId)
    )
  } catch (error: any) {
    message.error('加载标签失败')
  }
}

// 处理标签左键点击（单选）
const handleTagLeftClick = async (tag: any) => {
  selectedTagIds.value = [tag.id]
  allTagsSelected.value = selectedTagIds.value.length === tags.value.length
}

// 处理标签右键点击（多选）
const handleTagRightClick = async (tag: any, event: MouseEvent) => {
  event.preventDefault()

  if (selectedTagIds.value.includes(tag.id)) {
    const index = selectedTagIds.value.indexOf(tag.id)
    if (index > -1) {
      selectedTagIds.value.splice(index, 1)
    }
  } else {
    selectedTagIds.value.push(tag.id)
  }

  allTagsSelected.value = selectedTagIds.value.length === tags.value.length
}

// 全选/反选标签
const toggleAllTags = async () => {
  if (allTagsSelected.value) {
    selectedTagIds.value = []
    allTagsSelected.value = false
  } else {
    selectedTagIds.value = tags.value.map((tag) => tag.id)
    allTagsSelected.value = true
  }
}

// 打开标签管理对话框
const openTagManager = () => {
  tagDialogObject.data = {
    fullPath: '',
    name: '标签管理'
  }
  tagDialogObject.mode = 'manage'
  tagDialogObject.show = true
}

// 处理设置标签
const handleSetTag = (item: any) => {
  tagDialogObject.data = {
    fullPath: `${item.source}:${item.authorId}`,
    name: item.authorName || item.authorId
  }
  tagDialogObject.mode = 'assign'
  tagDialogObject.show = true
}

// 标签变化回调
const onTagsChange = async () => {
  await loadTags()
  await refresh()
}

onMounted(async () => {
  await refresh()
  await loadTags()
})
</script>
<style scoped lang="scss">
// 页面容器
.page-container {
  height: 100%;
  width: 100%;
  background-color: #f9fafb;
  padding: 10px;
}

.content-container {
  overflow: auto;
  height: 100%;
  display: flex;
  flex-direction: column;
}

// 页面标题与搜索区域
.header-section {
  margin-bottom: 10px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

// 新作品提示样式
.new-artwork-notification {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 14px;

  .n-icon {
    color: #dc2626;
  }

  .notification-buttons {
    margin-left: auto;
    display: flex;
    gap: 8px;

    .n-button {
      font-size: 12px;
      height: 24px;
      padding: 0 8px;
    }
  }
}

// 标签筛选区域样式
.tag-filter-section {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background-color: white;
  padding: 12px;
}

.tag-filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tag-filter-title {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-filter-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-filter-list {
  max-height: 120px;
  overflow-y: auto;
}

.empty-tags {
  text-align: center;
  color: #6b7280;
  padding: 10px;
  font-size: 12px;
}

.tag-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-item {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
  user-select: none;
  font-size: 12px;
  border: 1px solid #e5e7eb;
  background-color: #f9fafb;

  &:hover {
    background-color: #f3f4f6;
  }

  &.tag-selected {
    background-color: #04f70416;
    border-color: #18a058;
    color: #18a058;
  }
}

.tag-item-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.folder-icon {
  color: #aaa;
}

.tag-label {
  white-space: nowrap;
}
</style>

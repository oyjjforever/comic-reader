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
              :menu-props="{ class: 'attention-dark-menu' }"
            />
            <n-button type="primary" size="small" @click="refresh">刷新</n-button>
            <n-button
              type="success"
              size="small"
              :loading="incrementalLoading"
              @click="incrementalUpdateAll"
            >
              全部追更
            </n-button>
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
      :media="tagDialogObject.data"
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
import siteUtils from '@renderer/plugins/site-utils/index.js'
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import { debounce } from 'lodash'
const message = useMessage()

// 使用新作品检测store
const newArtworkDetector = useNewArtworkDetectorStore()

const sourceOptions = [
  { label: '全部', value: null },
  { label: 'pixiv', value: 'pixiv' },
  { label: 'jmtt', value: 'jmtt' },
  { label: 'twitter', value: 'twitter' },
  { label: 'weibo', value: 'weibo' },
  { label: 'huangguo', value: 'huangguo' }
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
const incrementalLoading = ref(false)

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

// 批量追更所有有新作品的作者
async function incrementalUpdateAll() {
  const targets = items.value.filter((u) => newArtworkDetector.hasNewArtwork(u.source, u.authorId))
  if (targets.length === 0) {
    message.info('暂无需要追更的作者')
    return
  }
  incrementalLoading.value = true
  let total = 0
  const msg = message.create(`正在追更 (0/${targets.length})...`, {
    type: 'loading',
    duration: 0
  })
  for (let i = 0; i < targets.length; i++) {
    const item = targets[i]
    msg.content = `正在追更 ${item.authorName || item.authorId} (${i + 1}/${
      targets.length
    })，已找到 0 个...`
    try {
      const count = await siteUtils.downloadNew(item.source, item, (n) => {
        msg.content = `正在追更 ${item.authorName || item.authorId} (${i + 1}/${
          targets.length
        })，已找到 ${n} 个...`
      })
      total += count
      if (count > 0) {
        newArtworkDetector.clearNewArtworkMark(item.source, item.authorId)
      }
    } catch (error) {
      console.error(`追更失败: ${item.source}:${item.authorId}`, error)
    }
  }
  msg.type = 'success'
  msg.content = `追更完成，共新增 ${total} 个作品`
  setTimeout(() => msg.destroy(), 2500)
  incrementalLoading.value = false
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
// 页面画布：黑橙底 + 辉光 + 点阵（与书架 home-container 同款）
.page-container {
  height: 100%;
  width: 100%;
  background-color: #4a4656;
  background-image:
    radial-gradient(ellipse 85% 65% at 15% 8%, rgba(255, 146, 5, 0.22), transparent 60%),
    radial-gradient(ellipse 75% 60% at 92% 96%, rgba(255, 146, 5, 0.14), transparent 62%),
    radial-gradient(circle, rgba(255, 146, 5, 0.1) 1px, transparent 1.6px);
  background-size:
    100% 100%,
    100% 100%,
    26px 26px;
  color: #d9d4de;
  padding: 10px;

  // 暗色滚动条：橙色胶囊滑块，槽完全透明（track-piece 一并置透明，
  // 否则 Chromium 会给滑块两侧画默认底色）
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(255, 146, 5, 0.45);
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px rgba(255, 220, 170, 0.25);

    &:hover {
      background: rgba(255, 146, 5, 0.7);
    }
  }

  ::-webkit-scrollbar-track,
  ::-webkit-scrollbar-track-piece,
  ::-webkit-scrollbar-corner {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  // 暗色画布上的 naive 组件适配（与书架 navbar 同一套皮肤：交互色以内联
  // CSS 变量下发，需 !important 覆盖；下拉浮层走全局主题不受此影响）
  .n-button--default-type {
    --n-color: rgba(255, 255, 255, 0.08) !important;
    --n-color-hover: rgba(255, 255, 255, 0.16) !important;
    --n-color-pressed: rgba(255, 255, 255, 0.22) !important;
    --n-color-focus: rgba(255, 255, 255, 0.16) !important;
    --n-color-disabled: rgba(255, 255, 255, 0.04) !important;
    --n-text-color: #d9d4de !important;
    --n-text-color-hover: #ffca85 !important;
    --n-text-color-pressed: #ffca85 !important;
    --n-text-color-focus: #ffca85 !important;
    --n-text-color-disabled: #6f6a7d !important;
    --n-border: 1px solid rgba(255, 255, 255, 0.18) !important;
    --n-border-hover: 1px solid rgba(255, 146, 5, 0.55) !important;
    --n-border-pressed: 1px solid rgba(255, 146, 5, 0.75) !important;
    --n-border-focus: 1px solid rgba(255, 146, 5, 0.55) !important;
    --n-border-disabled: 1px solid rgba(255, 255, 255, 0.1) !important;
    --n-icon-color: #9d97ab !important;
    --n-icon-color-hover: #ffca85 !important;
    --n-icon-color-pressed: #ffca85 !important;
    --n-icon-color-focus: #ffca85 !important;
  }

  // 主操作按钮（刷新）：品牌橙实底（同书架激活态视图按钮）
  .n-button--primary-type {
    --n-color: #ff9205 !important;
    --n-color-hover: #ffa740 !important;
    --n-color-pressed: #e67e00 !important;
    --n-color-focus: #ffa740 !important;
    --n-text-color: #ffffff !important;
    --n-text-color-hover: #ffffff !important;
    --n-text-color-pressed: #ffffff !important;
    --n-text-color-focus: #ffffff !important;
    --n-border: 1px solid transparent !important;
    --n-border-hover: 1px solid transparent !important;
    --n-border-pressed: 1px solid transparent !important;
    --n-border-focus: 1px solid transparent !important;
  }

  .n-input {
    --n-color: rgba(255, 255, 255, 0.08) !important;
    /* 悬停不变底色，只保留边框反馈 */
    --n-color-hover: rgba(255, 255, 255, 0.08) !important;
    --n-color-focus: rgba(255, 255, 255, 0.12) !important;
    --n-border: 1px solid rgba(255, 255, 255, 0.18) !important;
    --n-border-hover: 1px solid rgba(255, 146, 5, 0.55) !important;
    --n-border-focus: 1px solid rgba(255, 146, 5, 0.75) !important;
    --n-text-color: #d9d4de !important;
    --n-caret-color: #ff9205 !important;
    --n-placeholder-color: #9a92a0 !important;
    --n-icon-color: #9d97ab !important;
    --n-icon-color-hover: #ffca85 !important;
    --n-clear-color: #9a92a0 !important;
    --n-clear-color-hover: #ffca85 !important;
    --n-clear-color-pressed: #ffca85 !important;
  }

  // 站点筛选下拉的触发器换暗肤（:deep 穿透 n-select 内部结构，
  // .n-base-selection 未必是组件根、拿不到 scoped 属性）
  :deep(.n-base-selection) {
    --n-color: rgba(255, 255, 255, 0.08) !important;
    --n-color-hover: rgba(255, 255, 255, 0.08) !important;
    --n-color-active: rgba(255, 255, 255, 0.12) !important;
    --n-color-focus: rgba(255, 255, 255, 0.12) !important;
    --n-border: 1px solid rgba(255, 255, 255, 0.18) !important;
    --n-border-hover: 1px solid rgba(255, 146, 5, 0.55) !important;
    --n-border-active: 1px solid rgba(255, 146, 5, 0.75) !important;
    --n-border-focus: 1px solid rgba(255, 146, 5, 0.75) !important;
    --n-text-color: #d9d4de !important;
    --n-placeholder-color: #9a92a0 !important;
    --n-icon-color: #9d97ab !important;
    --n-icon-color-hover: #ffca85 !important;
  }
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
  color: #ece8f3;
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

// 新作品提示：暗红玻璃警示条
.new-artwork-notification {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  background: rgba(120, 30, 30, 0.32);
  border: 1px solid rgba(248, 113, 113, 0.45);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 24px -12px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #ff9d9d;
  font-size: 14px;

  .n-icon {
    color: #ff9d9d;
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

// 标签筛选区域：悬浮暗色毛玻璃面板（与书架侧栏同款）
.tag-filter-section {
  margin-top: 10px;
  background: linear-gradient(
      115deg,
      transparent 0%,
      rgba(255, 255, 255, 0.18) 100%,
      transparent 50%
    ),
    rgba(26, 24, 32, 0.75);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 24px -10px rgba(0, 0, 0, 0.6);
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
  color: #d9d4de;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;

  .n-icon {
    color: #9d97ab;
  }
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
  color: #9d97ab;
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
  border-radius: 6px;
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s;
  user-select: none;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background-color: rgba(255, 255, 255, 0.06);
  color: #c9c3d4;

  &:hover {
    background-color: rgba(255, 255, 255, 0.12);
  }

  &.tag-selected {
    background-color: rgba(255, 146, 5, 0.2);
    border-color: rgba(255, 146, 5, 0.65);
    color: #ffca85;
  }
}

.tag-item-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.folder-icon {
  color: #9d97ab;
}

.tag-label {
  white-space: nowrap;
}
</style>

<style lang="scss">
// 下拉菜单浮层（Teleport 到 body，scoped 够不着，须全局）：挂到菜单上的
// attention-dark-menu 类由 n-select 的 menu-props 注入。菜单的交互色由 naive
// 按全局主题以内联 CSS 变量下发（浅色主题为浅底深字），需 !important 覆盖
.attention-dark-menu {
  background: linear-gradient(
      115deg,
      transparent 0%,
      rgba(255, 255, 255, 0.14) 100%,
      transparent 50%
    ),
    rgba(26, 24, 32, 0.95) !important;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.7) !important;

  --n-color: rgba(26, 24, 32, 0.95) !important;
  --n-border-radius: 12px !important;
  --n-option-text-color: #d9d4de !important;
  --n-option-text-color-hover: #ffca85 !important;
  --n-option-text-color-active: #ffca85 !important;
  --n-option-text-color-disabled: #6f6a7d !important;
  --n-option-color-pending: rgba(255, 255, 255, 0.08) !important;
  --n-option-color-active: rgba(255, 146, 5, 0.22) !important;
  --n-option-color-active-hover: rgba(255, 146, 5, 0.3) !important;
  --n-action-divider-color: rgba(255, 255, 255, 0.12) !important;
  --n-action-text-color: #d9d4de !important;

  // 菜单内滚动条同步橙色胶囊
  ::-webkit-scrollbar {
    width: 8px;
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(255, 146, 5, 0.45);
    border-radius: 8px;

    &:hover {
      background: rgba(255, 146, 5, 0.7);
    }
  }

  ::-webkit-scrollbar-track,
  ::-webkit-scrollbar-track-piece,
  ::-webkit-scrollbar-corner {
    background: transparent;
    border: none;
    box-shadow: none;
  }
}
</style>

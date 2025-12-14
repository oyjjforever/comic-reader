<template>
  <div class="page-container">
    <div class="content-container">
      <!-- 页面标题与搜索区域 -->
      <div class="header-section">
        <h1 class="page-title">特别关注</h1>
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
          />
        </template>
      </ResponsiveVirtualGrid>
    </div>
  </div>
</template>
<script lang="ts" setup name="specialAttention">
import AuthorCard from './author-card.vue'
import { NButton, NInput, NSelect, useMessage, NIcon } from 'naive-ui'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
import { Alert24Regular } from '@vicons/fluent'
import { useNewArtworkDetectorStore } from '@renderer/plugins/store/newArtworkDetector'
import { ref, computed, onMounted, onUnmounted } from 'vue'
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

    return matchName && matchSource && showItem
  })
})
async function refresh() {
  const list = await window.specialAttention.list()
  items.value = list //[list[0], list[1]]
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

onMounted(async () => {
  await refresh()
})
</script>
<style scoped lang="scss">
// 页面容器
.page-container {
  height: 100vh;
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
</style>

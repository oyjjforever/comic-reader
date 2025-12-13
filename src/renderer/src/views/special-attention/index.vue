<template>
  <div class="page-container">
    <div class="content-container">
      <!-- 页面标题与搜索区域 -->
      <div class="header-section">
        <h1 class="page-title">特别关注</h1>
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
import { NButton, NInput, NSelect, useMessage } from 'naive-ui'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'
const message = useMessage()

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
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return items.value.filter((u) => {
    const matchName =
      !q ||
      (u.authorName || '').toLowerCase().includes(q) ||
      (u.authorId || '').toLowerCase().includes(q)
    const matchSource = !sourceFilter.value || u.source === sourceFilter.value
    return matchName && matchSource
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
</style>

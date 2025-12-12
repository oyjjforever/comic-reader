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
            placeholder="请输入作者名称进行搜索"
            class="search-input"
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
      <!-- 作者列表 - 使用虚拟滚动 -->
      <ResponsiveVirtualGrid
        ref="virtualGridRef"
        :items="filteredItems"
        :min-item-width="560"
        :max-item-width="630"
        :aspect-ratio="2.5"
        :gap="20"
        key-field="id"
      >
        <template #default="{ item }">
          <AuthorCard :item="item" @remove="onRemove" @download-all="onDownloadAll" />
        </template>
      </ResponsiveVirtualGrid>
    </div>
  </div>
</template>
<script lang="ts" setup>
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
async function onDownloadAll(item) {}
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

.search-input-container {
  position: relative;
  flex: 1;
}

.search-input {
  width: 100%;
  height: 32px;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}
</style>

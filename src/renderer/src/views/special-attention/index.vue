<template>
  <div class="page-container">
    <div class="content-container">
      <!-- 页面标题与搜索区域 -->
      <div class="header-section">
        <h1 class="page-title">特别关注</h1>
        <div class="search-controls">
          <div class="search-input-container">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索作者名称..."
              class="search-input"
            />
            <i class="fas fa-search search-icon"></i>
          </div>
          <div class="control-buttons">
            <div class="dropdown-container">
              <button @click="toggleSortDropdown" class="control-button sort-button">
                <i class="fas fa-sort"></i>
                排序方式
              </button>
              <div v-if="showSortDropdown" class="sort-dropdown">
                <div
                  v-for="option in sortOptions"
                  :key="option.value"
                  @click="setSort(option.value)"
                  class="sort-option"
                >
                  <span>{{ option.label }}</span>
                  <i v-if="currentSort === option.value" class="fas fa-check sort-check"></i>
                </div>
              </div>
            </div>
            <button @click="toggleFilter" class="control-button">
              <i class="fas fa-filter"></i>
              筛选
            </button>
          </div>
        </div>
      </div>
      <!-- 筛选面板 -->
      <div v-if="showFilterPanel" class="filter-panel">
        <div class="filter-content">
          <label class="filter-label">
            <input type="checkbox" v-model="filterNewWorks" class="filter-checkbox" />
            仅显示有新作品的作者
          </label>
        </div>
      </div>
      <!-- 作者列表 - 使用虚拟滚动 -->
      <ResponsiveVirtualGrid
        ref="virtualGridRef"
        :items="filteredAuthors"
        :item-width="550"
        :aspect-ratio="0.8"
        :gap="20"
        key-field="id"
      >
        <template #default="{ item }">
          <AuthorCard
            :author="item"
            :current-page="currentPage[item.id] || 1"
            @unfollow-author="unfollowAuthor"
            @download-work="downloadWork"
            @download-all-works="downloadAllWorks"
            @open-work-modal="openWorkModal"
            @start-drag="startDrag"
            @page-change="setCurrentPage"
          />
        </template>
      </ResponsiveVirtualGrid>
      <!-- 作品详情模态框 -->
      <div v-if="selectedWork" class="modal-overlay" @click="closeWorkModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">{{ selectedWork.title }}</h3>
            <button @click="closeWorkModal" class="modal-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <img :src="selectedWork.image" :alt="selectedWork.title" class="modal-image" />
            <div class="modal-actions">
              <button @click="downloadWork(selectedWork)" class="modal-download-button">
                <i class="fas fa-download"></i>
                下载作品
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, computed, reactive, onMounted } from 'vue'
import AuthorCard from './author-card.vue'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'

// 数据模型定义
interface Work {
  id: string
  title: string
  image: string
}
interface Author {
  id: string
  name: string
  avatar: string
  works: Work[]
  followedAt: Date
}

// 搜索和筛选状态
const searchQuery = ref('')
const showSortDropdown = ref(false)
const currentSort = ref('name')
const showFilterPanel = ref(false)
const filterNewWorks = ref(false)

// 分页状态
const currentPage = reactive<Record<string, number>>({})

// 模态框状态
const selectedWork = ref<Work | null>(null)

// 虚拟滚动网格引用
const virtualGridRef = ref()

// 排序选项
const sortOptions = [
  { label: '按名称排序', value: 'name' },
  { label: '按关注时间排序', value: 'followedAt' },
  { label: '按作品数量排序', value: 'worksCount' }
]

// 拖拽状态
const draggedAuthor = ref<Author | null>(null)

// 模拟作者数据
const authors = ref<Author[]>([
  {
    id: '1',
    name: '林晓雨',
    avatar: 'https://ai-public.mastergo.com/ai/img_res/18f28467c85136b9329b58aef43dc242.jpg',
    followedAt: new Date('2023-01-15'),
    works: Array.from({ length: 15 }, (_, i) => ({
      id: `1-${i + 1}`,
      title: `山水画作品 ${i + 1}`,
      image: `https://img-nos.yiyouliao.com/alph/73c0cf110d2a14e92f48633db4a833c8.jpeg?yiyouliao_channel=vivo_image`
    }))
  },
  {
    id: '2',
    name: '张艺轩',
    avatar: 'https://ai-public.mastergo.com/ai/img_res/78735cfe39b76a18aa8064205a5e2e1c.jpg',
    followedAt: new Date('2023-02-20'),
    works: Array.from({ length: 8 }, (_, i) => ({
      id: `2-${i + 1}`,
      title: `现代插画 ${i + 1}`,
      image: `https://img-nos.yiyouliao.com/alph/73c0cf110d2a14e92f48633db4a833c8.jpeg?yiyouliao_channel=vivo_image`
    }))
  },
  {
    id: '3',
    name: '陈思琪',
    avatar: 'https://ai-public.mastergo.com/ai/img_res/473fad9358f7ec68a254221aa94947d7.jpg',
    followedAt: new Date('2023-03-10'),
    works: Array.from({ length: 22 }, (_, i) => ({
      id: `3-${i + 1}`,
      title: `城市摄影 ${i + 1}`,
      image: `https://img-nos.yiyouliao.com/alph/73c0cf110d2a14e92f48633db4a833c8.jpeg?yiyouliao_channel=vivo_image`
    }))
  },
  {
    id: '4',
    name: '王俊凯',
    avatar: 'https://ai-public.mastergo.com/ai/img_res/af715597ad26e06f6664724bc963f8b7.jpg',
    followedAt: new Date('2023-04-05'),
    works: Array.from({ length: 12 }, (_, i) => ({
      id: `4-${i + 1}`,
      title: `人物肖像 ${i + 1}`,
      image: `https://img-nos.yiyouliao.com/alph/73c0cf110d2a14e92f48633db4a833c8.jpeg?yiyouliao_channel=vivo_image`
    }))
  },
  {
    id: '5',
    name: '刘雅婷',
    avatar: 'https://ai-public.mastergo.com/ai/img_res/daa0a25806cdf0819a113cf3c513b0f0.jpg',
    followedAt: new Date('2023-05-18'),
    works: Array.from({ length: 18 }, (_, i) => ({
      id: `5-${i + 1}`,
      title: `平面设计 ${i + 1}`,
      image: `https://img-nos.yiyouliao.com/alph/73c0cf110d2a14e92f48633db4a833c8.jpeg?yiyouliao_channel=vivo_image`
    }))
  },
  {
    id: '6',
    name: '赵子涵',
    avatar: 'https://ai-public.mastergo.com/ai/img_res/542fd7f40a6bc19efde20b8519563ea6.jpg',
    followedAt: new Date('2023-06-22'),
    works: Array.from({ length: 9 }, (_, i) => ({
      id: `6-${i + 1}`,
      title: `3D 建模 ${i + 1}`,
      image: `https://img-nos.yiyouliao.com/alph/73c0cf110d2a14e92f48633db4a833c8.jpeg?yiyouliao_channel=vivo_image`
    }))
  }
])

// 计算属性：过滤后的作者列表
const filteredAuthors = computed(() => {
  let result = [...authors.value]
  // 应用搜索过滤
  if (searchQuery.value) {
    result = result.filter((author) =>
      author.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }
  // 应用新作品过滤
  if (filterNewWorks.value) {
    result = result.filter((author) => author.works.length > 10)
  }
  // 应用排序
  switch (currentSort.value) {
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'followedAt':
      result.sort((a, b) => b.followedAt.getTime() - a.followedAt.getTime())
      break
    case 'worksCount':
      result.sort((a, b) => b.works.length - a.works.length)
      break
  }
  return result
})

// 分页方法
const setCurrentPage = (authorId: string, page: number) => {
  const totalPages = Math.ceil(authors.value.find((a) => a.id === authorId)?.works.length! / 9)
  if (page >= 1 && page <= totalPages) {
    currentPage[authorId] = page
  }
}

// 操作方法
const unfollowAuthor = (authorId: string) => {
  authors.value = authors.value.filter((author) => author.id !== authorId)
}

const downloadWork = (work: Work) => {
  console.log(`下载作品: ${work.title}`)
  // 实际项目中这里会调用下载API
}

const downloadAllWorks = (authorId: string) => {
  const author = authors.value.find((a) => a.id === authorId)
  if (author) {
    console.log(`下载 ${author.name} 的所有作品 (${author.works.length} 个)`)
    // 实际项目中这里会调用批量下载API
  }
}

// 模态框操作
const openWorkModal = (work: Work) => {
  selectedWork.value = work
}

const closeWorkModal = () => {
  selectedWork.value = null
}

// 拖拽排序操作
const startDrag = (e: MouseEvent, author: Author) => {
  draggedAuthor.value = author
  e.preventDefault()
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
}

const onDrop = (targetAuthor: Author) => {
  if (!draggedAuthor.value) return
  if (draggedAuthor.value.id === targetAuthor.id) return

  const draggedIndex = authors.value.findIndex((a) => a.id === draggedAuthor.value!.id)
  const targetIndex = authors.value.findIndex((a) => a.id === targetAuthor.id)

  // 移动作者位置
  const movedAuthor = authors.value.splice(draggedIndex, 1)[0]
  authors.value.splice(targetIndex, 0, movedAuthor)

  draggedAuthor.value = null
}

// UI 控制方法
const toggleSortDropdown = () => {
  showSortDropdown.value = !showSortDropdown.value
}

const setSort = (sortValue: string) => {
  currentSort.value = sortValue
  showSortDropdown.value = false
}

const toggleFilter = () => {
  showFilterPanel.value = !showFilterPanel.value
}

// 点击外部关闭下拉菜单
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  if (!target.closest('.relative') && showSortDropdown.value) {
    showSortDropdown.value = false
  }
})

// 组件挂载后，如果需要可以重置滚动位置
onMounted(() => {
  // 可以在这里添加初始化逻辑
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
  font-size: 1.875rem;
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
  padding: 0.5rem 1rem 0.5rem 2.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;

  &:focus {
    outline: none;
    border-color: transparent;
    box-shadow: 0 0 0 2px #3b82f6;
  }
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

.control-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: white;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f9fafb;
  }
}

.sort-button {
  // 额外的样式可以在这里添加
}

.dropdown-container {
  position: relative;
}

.sort-dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 0.25rem;
  width: 12rem;
  background-color: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.sort-option {
  padding: 0.5rem 1rem;
  display: flex;
  justify-content: space-between;
  cursor: pointer;

  &:hover {
    background-color: #f3f4f6;
  }
}

.sort-check {
  color: #3b82f6;
}

// 筛选面板
.filter-panel {
  background-color: white;
  padding: 1rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
  border: 1px solid #e5e7eb;
}

.filter-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.filter-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.filter-checkbox {
  margin-right: 0.5rem;
  height: 1rem;
  width: 1rem;
  color: #2563eb;
  border-radius: 0.25rem;
}

// 作品详情模态框
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.modal-content {
  background-color: white;
  border-radius: 0.75rem;
  max-width: 42rem;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
}

.modal-close {
  color: #6b7280;
  cursor: pointer;

  &:hover {
    color: #374151;
  }
}

.modal-body {
  padding: 1rem;
}

.modal-image {
  width: 100%;
  height: auto;
  border-radius: 0.5rem;
}

.modal-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.modal-download-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: #3b82f6;
  color: white;
  border-radius: 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2563eb;
  }
}
</style>

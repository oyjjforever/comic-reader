<template>
  <div class="author-card">
    <!-- 作者头部信息 -->
    <div class="author-header">
      <img :src="author.avatar" :alt="author.name" class="author-avatar" />
      <div class="author-info">
        <h3 class="author-name">{{ author.name }}</h3>
        <p class="works-count">{{ author.works.length }} 个作品</p>
      </div>
    </div>
    <!-- 作品预览区域 -->
    <div class="works-section">
      <div class="works-container">
        <div class="works-list">
          <div v-for="(work, index) in visibleWorks" :key="index" class="work-item">
            <img
              :src="work.image"
              :alt="work.title"
              class="work-image"
              @click="openWorkModal(work)"
            />
            <div class="work-overlay">
              <button @click="downloadWork(work)" class="download-button">
                <i class="fas fa-download"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- 分页指示器 -->
      <div class="pagination-controls">
        <div class="works-info">
          {{ Math.min(visibleWorks.length, author.works.length) }} /
          {{ author.works.length }}
        </div>
        <div class="pagination-buttons">
          <button @click="prevPage" class="pagination-button">
            <i class="fas fa-chevron-left"></i>
          </button>
          <button @click="nextPage" class="pagination-button">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
    <!-- 操作按钮区域 -->
    <div class="action-buttons">
      <button @click="unfollowAuthor" class="action-button unfollow-button">
        <i class="fas fa-user-times"></i>
        取消关注
      </button>
      <button @click="downloadAllWorks" class="action-button download-all-button">
        <i class="fas fa-download"></i>
        全部下载
      </button>
      <button @mousedown="startDrag" class="action-button drag-button">
        <i class="fas fa-grip-lines"></i>
        拖拽排序
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'

// 定义组件的props
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

const props = defineProps<{
  author: Author
  currentPage: number
}>()

// 定义组件的事件
const emit = defineEmits<{
  'unfollow-author': [authorId: string]
  'download-work': [work: Work]
  'download-all-works': [authorId: string]
  'open-work-modal': [work: Work]
  'start-drag': [event: MouseEvent, author: Author]
  'page-change': [authorId: string, page: number]
}>()
const pageSize = 5
// 计算当前页显示的作品
const visibleWorks = computed(() => {
  const startIndex = (props.currentPage - 1) * pageSize
  return props.author.works.slice(startIndex, startIndex + pageSize)
})

// 分页方法
const totalPages = computed(() => Math.ceil(props.author.works.length / pageSize))

const prevPage = () => {
  if (props.currentPage > 1) {
    emit('page-change', props.author.id, props.currentPage - 1)
  }
}

const nextPage = () => {
  if (props.currentPage < totalPages.value) {
    emit('page-change', props.author.id, props.currentPage + 1)
  }
}

// 操作方法
const unfollowAuthor = () => {
  emit('unfollow-author', props.author.id)
}

const downloadWork = (work: Work) => {
  emit('download-work', work)
}

const downloadAllWorks = () => {
  emit('download-all-works', props.author.id)
}

const openWorkModal = (work: Work) => {
  emit('open-work-modal', work)
}

const startDrag = (event: MouseEvent) => {
  emit('start-drag', event, props.author)
}
</script>

<style scoped lang="scss">
.author-card {
  width: 100%;
  height: 100%;
  background-color: white;
  border-radius: 0.75rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #e5e7eb;
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }
}

// 作者头部信息
.author-header {
  padding: 4px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.author-avatar {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.author-info {
  flex: 1;
  min-width: 0; // 允许文本截断
}

.author-name {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.works-count {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0;
}

// 作品预览区域
.works-section {
  padding: 4px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; // 允许内容区域收缩
}

.works-container {
  position: relative;
  flex: 1;
  min-height: 0; // 允许内容区域收缩
}

.works-list {
  display: grid;
  grid-template-columns: repeat(5, 100px);
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  min-height: 0; // 允许内容区域收缩

  // 隐藏滚动条
  &::-webkit-scrollbar {
    display: none;
  }

  -ms-overflow-style: none;
  scrollbar-width: none;
}

.work-item {
  flex-shrink: 0;
  position: relative;

  &:hover .work-overlay {
    opacity: 1;
  }
}

.work-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0.5rem;
  cursor: pointer;
}

.work-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: 0.5rem;
}

.download-button {
  color: white;

  &:hover {
    color: #93c5fd;
  }
}

// 分页指示器
.pagination-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  flex-shrink: 0;
}

.works-info {
  font-size: 0.75rem;
  color: #6b7280;
}

.pagination-buttons {
  display: flex;
  gap: 0.25rem;
}

.pagination-button {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f3f4f6;
  cursor: pointer;
  font-size: 0.75rem;

  &:hover {
    background-color: #e5e7eb;
  }
}

// 操作按钮区域
.action-buttons {
  padding: 0.5rem;
  background-color: #f9fafb;
  display: flex;
  justify-content: space-between;
  border-top: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s;
}

.unfollow-button {
  color: #ef4444;

  &:hover {
    color: #dc2626;
  }
}

.download-all-button {
  color: #10b981;

  &:hover {
    color: #059669;
  }
}

.drag-button {
  color: #3b82f6;
  cursor: move;

  &:hover {
    color: #2563eb;
  }
}
</style>

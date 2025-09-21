<template>
  <div class="comic-card" ref="cardRef">
    <!-- 封面区域 -->
    <div class="cover-container">
      <!-- 封面图片 -->
      <div class="cover-image-wrapper">
        <img
          v-if="coverImageSrc && !imageError"
          :src="coverImageSrc"
          :alt="folder.name"
          class="cover-image"
          @error="onImageError"
        />
        <div v-else-if="isLoadingCover" class="loading-cover">
          <n-icon :component="FolderIcon" size="32" />
          <div class="loading-text">加载中...</div>
        </div>
        <div v-else class="default-cover">
          <n-icon :component="FolderIcon" size="48" />
          <div class="default-text">{{ folder.name }}</div>
        </div>
      </div>

      <!-- 收藏按钮 -->
      <button
        class="bookmark-btn"
        :class="{ bookmarked: isBookmarked }"
        @click.stop="toggleBookmark"
      >
        <n-icon :component="isBookmarked ? BookmarkIcon : BookmarkOutlineIcon" size="16" />
      </button>

      <!-- 文件夹类型标识 -->
      <div
        v-if="folder.contentType"
        class="folder-type-badge"
        :class="`type-${folder.contentType}`"
      >
        {{ getFolderTypeText(folder.contentType) }}
      </div>
    </div>

    <!-- 信息展示区 -->
    <div class="info-section">
      <h3 class="comic-title" :title="folder.name">
        {{ folder.name }}
      </h3>
      <p class="page-count">{{ folder.fileCount }} 个文件</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  FolderOutline as FolderIcon,
  Bookmark as BookmarkIcon,
  BookmarkOutline as BookmarkOutlineIcon
} from '@vicons/ionicons5'
import type { FolderInfo } from '@/typings/file'

// 扩展 FolderInfo 接口以包含封面路径和收藏状态
interface FolderInfoWithCover extends FolderInfo {
  coverPath?: string
  isBookmarked?: boolean
}

interface Props {
  folder: FolderInfoWithCover
}

interface Emits {
  (e: 'toRead', folder: FolderInfoWithCover): void
  (e: 'bookmark', folder: FolderInfoWithCover, bookmarked: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const imageError = ref(false)
const coverImageSrc = ref<string>('')
const isLoadingCover = ref(false)
const isBookmarked = ref(props.folder.isBookmarked || false)
const cardRef = ref<HTMLElement>()
const observer = ref<IntersectionObserver>()
const hasCoverLoaded = ref(false)
const coverInfo = ref<{ coverPath?: string; coverFileName?: string }>({})

const toggleBookmark = async () => {
  try {
    const result = await window.favorite.toggleFavorite(props.folder.fullPath)
    isBookmarked.value = result
    emit('bookmark', props.folder, isBookmarked.value)
  } catch (error) {
    console.error('切换收藏状态失败:', error)
  }
}

const onImageError = () => {
  imageError.value = true
}

// 获取文件夹类型的中文显示文本
const getFolderTypeText = (contentType: string) => {
  const typeMap: Record<string, string> = {
    image: '图片',
    pdf: 'PDF',
    ebook: '电子书',
    mixed: '混合',
    empty: '空'
  }
  return typeMap[contentType] || contentType
}

// 懒加载封面信息
const loadCoverInfo = async () => {
  if (hasCoverLoaded.value) return

  try {
    isLoadingCover.value = true
    imageError.value = false

    // 获取封面信息
    const info = await window.book.getFolderCoverInfo(props.folder.fullPath)
    coverInfo.value = info

    // 如果有封面路径，加载封面图片
    if (info.coverPath) {
      await loadCoverImage(info.coverPath)
    }

    hasCoverLoaded.value = true
  } catch (error) {
    console.error('获取封面信息失败:', error)
    imageError.value = true
  } finally {
    isLoadingCover.value = false
  }
}

// 加载封面图片
const loadCoverImage = async (coverPath: string) => {
  try {
    // 直接使用 file:// 协议加载图片
    coverImageSrc.value = `file://${coverPath}`
  } catch (error) {
    console.error('加载封面图片失败:', error)
    imageError.value = true
    coverImageSrc.value = ''
  }
}

// 设置 Intersection Observer
const setupIntersectionObserver = () => {
  if (!cardRef.value) return

  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasCoverLoaded.value) {
          // 卡片进入视口，开始加载封面
          loadCoverInfo()
          // 加载完成后停止观察
          observer.value?.unobserve(entry.target)
        }
      })
    },
    {
      // 提前 100px 开始加载
      rootMargin: '100px',
      threshold: 0.1
    }
  )

  observer.value.observe(cardRef.value)
}

// 监听收藏状态变化
watch(
  () => props.folder.isBookmarked,
  (newVal) => {
    isBookmarked.value = newVal || false
  }
)

// 组件挂载时设置观察器和检查收藏状态
onMounted(async () => {
  await nextTick()
  setupIntersectionObserver()

  // 检查当前文件夹的收藏状态
  try {
    const isFavorited = await window.favorite.isFavorited(props.folder.fullPath)
    isBookmarked.value = isFavorited
  } catch (error) {
    console.error('检查收藏状态失败:', error)
  }
})

// 组件卸载时清理观察器
onUnmounted(() => {
  if (observer.value && cardRef.value) {
    observer.value.unobserve(cardRef.value)
    observer.value.disconnect()
  }
})
</script>

<style scoped>
/* 主卡片容器 */
.comic-card {
  background: #f8f9fa;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
  width: 100%;
  aspect-ratio: 3/4;
  display: flex;
  flex-direction: column;
}

.comic-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
}

/* 封面容器 */
.cover-container {
  position: relative;
  flex: 1;
  overflow: hidden;
}

/* 封面图片包装器 */
.cover-image-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: 12px 12px 0 0;
  overflow: hidden;
}

/* 封面图片 */
.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.comic-card:hover .cover-image {
  transform: scale(1.05);
}

/* 默认封面 */
.default-cover {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
  padding: 16px;
}

.default-text {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  opacity: 0.9;
}

/* 加载状态 */
.loading-cover {
  width: 100%;
  height: 100%;
  background: #f0f0f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  gap: 8px;
}

.loading-text {
  font-size: 12px;
  color: #666;
}

/* 收藏按钮 */
.bookmark-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 2;
}

.bookmark-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  transform: scale(1.1);
}

.bookmark-btn:active {
  transform: scale(0.95);
}

.bookmark-btn.bookmarked {
  background: rgba(255, 193, 7, 0.9);
  color: white;
}

.bookmark-btn.bookmarked:hover {
  background: rgba(255, 193, 7, 1);
}

/* 文件夹类型标识 */
.folder-type-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  color: white;
  backdrop-filter: blur(4px);
  z-index: 2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  background: rgba(3, 192, 235, 0.9);
}

.folder-type-badge:hover {
  transform: scale(1.05);
}

/* 不同类型的颜色 */
.folder-type-badge.type-image {
  background: rgba(52, 199, 89, 0.9);
}

.folder-type-badge.type-pdf {
  background: rgba(255, 59, 48, 0.9);
}

.folder-type-badge.type-ebook {
  background: rgba(0, 122, 255, 0.9);
}

.folder-type-badge.type-mixed {
  background: rgba(255, 149, 0, 0.9);
}

.folder-type-badge.type-empty {
  background: rgba(142, 142, 147, 0.9);
}

.bookmark-btn {
  top: 12px;
  left: 12px;
  width: 28px;
  height: 28px;
}

.folder-type-badge {
  top: 12px;
  right: 12px;
  padding: 3px 6px;
  font-size: 9px;
}

/* 信息展示区 */
.info-section {
  padding: 16px;
  background: white;
  border-radius: 0 0 12px 12px;
  flex-shrink: 0;
}

/* 漫画标题 */
.comic-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.3;
  margin: 0 0 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 2.6em; /* 确保双行高度 */
}

/* 页数信息 */
.page-count {
  font-size: 12px;
  color: #666666;
  margin: 0;
  font-weight: 400;
}

/* 夜间模式支持 */
@media (prefers-color-scheme: dark) {
  .comic-card {
    background: #2f2f2f;
  }

  .info-section {
    background: #2f2f2f;
  }

  .comic-title {
    color: #e0e0e0;
  }

  .page-count {
    color: #999;
  }

  .loading-cover {
    background: #404040;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .comic-card {
    border-radius: 8px;
  }

  .cover-image-wrapper {
    border-radius: 8px 8px 0 0;
  }

  .info-section {
    padding: 12px;
    border-radius: 0 0 8px 8px;
  }

  .comic-title {
    font-size: 14px;
  }

  .page-count {
    font-size: 11px;
  }

  .bookmark-btn {
    top: 12px;
    left: 12px;
    width: 28px;
    height: 28px;
  }
}

@media (max-width: 480px) {
  .comic-card {
    border-radius: 6px;
  }

  .cover-image-wrapper {
    border-radius: 6px 6px 0 0;
  }

  .info-section {
    padding: 10px;
    border-radius: 0 0 6px 6px;
  }

  .bookmark-btn {
    top: 8px;
    left: 8px;
    width: 24px;
    height: 24px;
  }

  .folder-type-badge {
    top: 8px;
    right: 8px;
    padding: 2px 5px;
    font-size: 8px;
    opacity: 0.7;
  }
}

/* 动画效果 */
@keyframes bookmarkPulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.bookmark-btn.bookmarked {
  animation: bookmarkPulse 0.3s ease-out;
}

/* 卡片进入动画 */
.comic-card {
  animation: cardFadeIn 0.4s ease-out;
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

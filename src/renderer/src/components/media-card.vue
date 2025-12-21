<template>
  <div
    class="media-card"
    ref="cardRef"
    @click="handleCardClick"
    @mouseenter="onMouseenter"
    @mouseleave="onMouseleave"
  >
    <!-- 封面区域 -->
    <div class="cover-container">
      <!-- 封面图片 -->
      <div class="cover-image-wrapper">
        <template v-if="!isHover || !enableHoverPreview || mediaType !== 'video'">
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
        </template>
        <video v-else-if="mediaType === 'video'" muted loop preload="metadata" ref="videoRef">
          <source :src="`file://${folder.fullPath}`" type="video/mp4" />
        </video>
      </div>

      <!-- 收藏按钮 -->
      <!-- <button
        class="bookmark-btn"
        :class="{ bookmarked: isBookmarked }"
        @click.stop="toggleBookmark"
      >
        <n-icon :component="isBookmarked ? BookmarkIcon : BookmarkOutlineIcon" size="16" />
      </button> -->

      <!-- 文件夹类型标识 -->
      <!-- <div
        v-if="showTypeBadge && folder.contentType"
        class="folder-type-badge"
        :class="`type-${folder.contentType}`"
      >
        {{ getFolderTypeText(folder.contentType) }}
      </div> -->

      <!-- 文件数量显示 -->
      <div v-if="showFileCount && folder.fileCount" class="info__pages">
        <n-icon :component="SlideMultiple24Regular" size="12" />{{ folder.fileCount }}
      </div>
    </div>

    <!-- 信息展示区 -->
    <div class="info-section">
      <h3 class="media-title" :title="folder.name">
        {{ folder.name }}
      </h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  FolderOutline as FolderIcon,
  Bookmark as BookmarkIcon,
  BookmarkOutline as BookmarkOutlineIcon
} from '@vicons/ionicons5'
import { SlideMultiple24Regular } from '@vicons/fluent'
import type { FolderInfo } from '@/typings/file'

// 扩展 FolderInfo 接口以包含封面路径和收藏状态
interface FolderInfoWithCover extends FolderInfo {
  coverPath?: string
  isBookmarked?: boolean
}

interface Props {
  folder: FolderInfoWithCover
  showFileCount?: boolean
  showTypeBadge?: boolean
  enableHoverPreview?: boolean
  namespace?: string
}

interface Emits {
  (e: 'toRead', folder: FolderInfoWithCover): void
  (e: 'bookmark', folder: FolderInfoWithCover, bookmarked: boolean): void
  (e: 'click', folder: FolderInfoWithCover): void
}

const props = withDefaults(defineProps<Props>(), {
  showFileCount: true,
  showTypeBadge: true,
  enableHoverPreview: false
})

// 自动判断媒体类型
const mediaType = computed(() => {
  // 否则检查文件扩展名是否为视频格式
  const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v']
  const coverPath = props.folder.coverPath || ''
  const extension = coverPath.toLowerCase().substring(coverPath.lastIndexOf('.'))

  if (videoExtensions.includes(extension)) {
    return 'video'
  }

  // 默认返回 book 类型
  return 'book'
})

const emit = defineEmits<Emits>()

// 处理卡片点击事件
const handleCardClick = async () => {
  // 记录浏览历史
  try {
    await window.browseHistory.addBrowseHistory(props.folder.fullPath, props.namespace)
  } catch (error) {
    console.error('记录浏览历史失败:', error)
  }

  // 触发原有的点击事件
  emit('click', props.folder)
}

const imageError = ref(false)
const coverImageSrc = ref<string>('')
const isLoadingCover = ref(false)
const isBookmarked = ref(props.folder.isBookmarked || false)
const cardRef = ref<HTMLElement>()
const observer = ref<IntersectionObserver>()
const hasCoverLoaded = ref(false)
const isHover = ref(false)
const videoRef = ref<HTMLVideoElement>()

// const toggleBookmark = async () => {
//   try {
//     const result = await window.favorite.toggleFavorite(props.folder.fullPath, mediaType.value)
//     isBookmarked.value = result
//     emit('bookmark', props.folder, isBookmarked.value)
//   } catch (error) {
//     console.error('切换收藏状态失败:', error)
//   }
// }

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

// 获取视频缩略图
const getVideoThumbnail = (path: string) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    // 注意处理文件路径，确保正确访问
    video.src = `file://${path}`
    video.crossOrigin = 'anonymous'

    video.addEventListener('loadedmetadata', () => {
      // 尝试定位到第5秒获取封面
      video.currentTime = 5
    })

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // 设置 canvas 尺寸与视频帧一致
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // 绘制视频帧到 canvas
      ctx && ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        // 获取 JPEG 格式的 base64 数据
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.9)
        resolve(thumbnailDataUrl)
      } catch (error) {
        reject(new Error('Failed to create data URL.'))
      }
    })

    video.addEventListener('error', () => {
      reject(new Error('Failed to load video.'))
    })
  })
}

// 懒加载封面信息
const loadCoverInfo = async () => {
  if (hasCoverLoaded.value) return

  try {
    isLoadingCover.value = true
    imageError.value = false

    // 检查文件夹是否处于加载状态
    if (props.folder.contentType === 'loading') {
      // 如果文件夹还在加载中，不尝试加载封面
      return
    }

    if (props.folder.coverPath) {
      if (mediaType.value === 'video') {
        // 视频类型：生成缩略图
        coverImageSrc.value = await getVideoThumbnail(props.folder.coverPath)
      } else {
        // 漫画类型：使用封面路径
        coverImageSrc.value = `file://${props.folder.coverPath}`
      }
    } else {
      // 封面路径为空，检查是否有文件
      if (props.folder.fileCount && props.folder.fileCount > 0) {
        // 有文件但没有封面路径，尝试使用文件夹路径作为视频封面
        coverImageSrc.value = await getVideoThumbnail(props.folder.fullPath)
      } else {
        // 没有文件，使用默认封面
        imageError.value = true
      }
    }

    hasCoverLoaded.value = true
  } catch (error) {
    console.error('获取封面信息失败:', error)
    imageError.value = true
    coverImageSrc.value = ''
  } finally {
    isLoadingCover.value = false
  }
}

// 设置 Intersection Observer
const setupIntersectionObserver = () => {
  if (!cardRef.value) return

  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasCoverLoaded.value) {
          // 卡片进入视口，检查文件夹状态后再加载封面
          if (props.folder.contentType !== 'loading') {
            // 只有当文件夹不是加载状态时才加载封面
            loadCoverInfo()
            // 加载完成后停止观察
            observer.value?.unobserve(entry.target)
          }
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

const onMouseenter = async () => {
  if (props.enableHoverPreview && mediaType.value === 'video') {
    isHover.value = true
    await nextTick()
    const video = videoRef.value
    if (video) {
      video.play()
    }
  }
}

const onMouseleave = async () => {
  if (props.enableHoverPreview && mediaType.value === 'video') {
    isHover.value = false
    const video = videoRef.value
    if (video) {
      video.pause()
      video.currentTime = 0
    }
  }
}

// 组件挂载时设置观察器和检查收藏状态
onMounted(async () => {
  setupIntersectionObserver()

  // 检查当前文件夹的收藏状态
  try {
    const isFavorited = await window.favorite.isFavorited(props.folder.fullPath, mediaType.value)
    isBookmarked.value = isFavorited
  } catch (error) {
    console.error('检查收藏状态失败:', error)
  }
})

// 监听文件夹状态变化，当详细信息加载完成后重新加载封面
watch(
  () => props.folder.contentType,
  (newContentType, oldContentType) => {
    // 当文件夹从加载状态变为其他状态时，尝试加载封面
    if (oldContentType === 'loading' && newContentType !== 'loading' && !hasCoverLoaded.value) {
      loadCoverInfo()
    }
  }
)

// 组件卸载时清理观察器
onUnmounted(() => {
  if (observer.value && cardRef.value) {
    observer.value.unobserve(cardRef.value)
    observer.value.disconnect()
    // 重置封面加载状态，确保组件重新挂载时可以重新加载
    hasCoverLoaded.value = false
  }
})
</script>

<script lang="ts">
export default {
  name: 'MediaCard'
}
</script>

<style lang="scss" scoped>
.media-card {
  background: #f8f9fa;
  border-radius: 12px;
  box-shadow: 3px 3px 15px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 3/4;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);

    .cover-image {
      transform: scale(1.05);
    }
  }
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

  video {
    transition: opacity 0.2s ease;
    position: absolute;
    bottom: -50%;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

/* 封面图片 */
.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
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
  top: 6px;
  left: 6px;
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

  &:hover {
    background: rgba(255, 255, 255, 0.95);
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }

  &.bookmarked {
    background: rgba(255, 193, 7, 0.9);
    color: white;
    animation: bookmarkPulse 0.3s ease-out;

    &:hover {
      background: rgba(255, 193, 7, 1);
    }
  }
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

  &:hover {
    transform: scale(1.05);
  }

  /* 不同类型的颜色 */
  &.type-image {
    background: rgba(52, 199, 89, 0.9);
  }

  &.type-pdf {
    background: rgba(255, 59, 48, 0.9);
  }

  &.type-ebook {
    background: rgba(0, 122, 255, 0.9);
  }

  &.type-mixed {
    background: rgba(255, 149, 0, 0.9);
  }

  &.type-empty {
    background: rgba(142, 142, 147, 0.9);
  }
}

/* 文件数量显示 */
.info__pages {
  width: fit-content;
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 2px;
  position: absolute;
  top: 5px;
  right: 5px;
  color: #fff;
  background: #00000071;
  backdrop-filter: blur(10px);
  border-radius: 5px;
  font-size: 12px;
  padding: 0px 4px;
  z-index: 2;
}

/* 信息展示区 */
.info-section {
  height: 70px;
  padding: 16px;
  background: white;
  border-radius: 0 0 12px 12px;
  flex-shrink: 0;
}

/* 媒体标题 */
.media-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
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

/* 卡片进入动画 */
.media-card {
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

/* 夜间模式支持 */
// @media (prefers-color-scheme: dark) {
//   .media-card {
//     background: #2f2f2f;
//   }

//   .info-section {
//     background: #2f2f2f;
//   }

//   .media-title {
//     color: #e0e0e0;
//   }

//   .loading-cover {
//     background: #404040;
//   }
// }

/* 响应式设计 */
@media (max-width: 768px) {
  .media-card {
    border-radius: 8px;
  }

  .cover-image-wrapper {
    border-radius: 8px 8px 0 0;
  }

  .info-section {
    padding: 12px;
    border-radius: 0 0 8px 8px;
  }

  .media-title {
    font-size: 14px;
  }

  .bookmark-btn {
    top: 12px;
    left: 12px;
    width: 28px;
    height: 28px;
  }
}

@media (max-width: 480px) {
  .media-card {
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
</style>

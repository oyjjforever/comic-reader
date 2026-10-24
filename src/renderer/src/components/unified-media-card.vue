<template>
  <div class="media-card" ref="cardRef" @click="handleCardClick">
    <!-- 封面区域 -->
    <div class="cover-container">
      <div class="cover-image-wrapper">
        <img
          v-if="coverImageSrc && !imageError"
          :src="coverImageSrc"
          :alt="item.title"
          class="cover-image"
          @error="onImageError"
        />
        <div v-else-if="isLoadingCover" class="loading-cover">
          <n-icon :component="FolderIcon" size="32" />
          <div class="loading-text">加载中...</div>
        </div>
        <div v-else class="default-cover">
          <n-icon :component="FolderIcon" size="48" />
          <div class="default-text">{{ item.title }}</div>
        </div>
      </div>

      <!-- 文件数量角标 -->
      <div v-if="showCount && item.fileCount" class="info__pages">
        <n-icon :component="SlideMultiple24Regular" size="12" />{{ item.fileCount }}
      </div>

      <!-- 评分（封面左上角） -->
      <div v-if="rating > 0" class="cover-rating" :title="`评分 ${rating} 星`">
        {{ rating }}<n-icon :component="Star24Filled" size="12" />
      </div>
    </div>

    <!-- 信息展示区 -->
    <div class="info-section">
      <h3 class="media-title" :title="item.title">
        {{ item.title }}
      </h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderOutline as FolderIcon } from '@vicons/ionicons5'
import { SlideMultiple24Regular, Star24Filled } from '@vicons/fluent'
import type { MediaItem } from '@/typings/media'

interface Props {
  /** 统一媒体条目（唯一必填参数） */
  item: MediaItem
  /** 评分/浏览历史的命名空间，默认取 item.source */
  namespace?: string
  /** 右上角数量角标 */
  showCount?: boolean
}

interface Emits {
  (e: 'open', item: MediaItem): void
}

const props = withDefaults(defineProps<Props>(), {
  namespace: '',
  showCount: true
})

const emit = defineEmits<Emits>()

const ns = computed(() => props.namespace || String(props.item.source))

const imageError = ref(false)
const coverImageSrc = ref<string>('')
const isLoadingCover = ref(false)
const rating = ref(0)
const cardRef = ref<HTMLElement>()
const observer = ref<IntersectionObserver>()
const hasCoverLoaded = ref(false)

const onImageError = () => {
  imageError.value = true
}

/**
 * 截取视频第 5 秒画面生成缩略图
 */
const getVideoThumbnail = (path: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video')
    video.src = `file://${path}`
    video.crossOrigin = 'anonymous'

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 5
    })

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx && ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch (error) {
        reject(new Error('Failed to create data URL.'))
      }
    })

    video.addEventListener('error', () => {
      reject(new Error('Failed to load video.'))
    })
  })
}

/**
 * 封面解析策略链：coverUrl（在线）→ coverPath（本地图片）→
 * videoPath（截帧并走缓存）→ 默认占位图
 */
const loadCoverInfo = async () => {
  if (hasCoverLoaded.value) return
  if (props.item.state === 'loading') return

  try {
    isLoadingCover.value = true
    imageError.value = false
    const item = props.item

    if (item.coverUrl) {
      coverImageSrc.value = item.coverUrl
    } else if (item.coverPath) {
      coverImageSrc.value = `file://${item.coverPath}`
    } else if (item.videoPath) {
      const cachedCover = await window.videoCover.get(item.videoPath)
      if (cachedCover) {
        coverImageSrc.value = `file://${cachedCover}`
      } else {
        const thumbnailDataUrl = await getVideoThumbnail(item.videoPath)
        coverImageSrc.value = thumbnailDataUrl
        // 异步写入缓存，不阻塞渲染
        window.videoCover
          .saveFromDataUrl(item.videoPath, thumbnailDataUrl)
          .catch((err) => console.warn('缓存视频封面失败:', err))
      }
    } else {
      coverImageSrc.value = ''
      imageError.value = true
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

// 视口懒加载封面
const setupIntersectionObserver = () => {
  if (!cardRef.value) return

  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasCoverLoaded.value) {
          if (props.item.state !== 'loading') {
            loadCoverInfo()
            observer.value?.unobserve(entry.target)
          }
        }
      })
    },
    {
      rootMargin: '100px',
      threshold: 0.1
    }
  )

  observer.value.observe(cardRef.value)
}

const handleCardClick = async () => {
  // 记录浏览历史
  try {
    await window.browseHistory.addBrowseHistory(props.item.path || '', ns.value)
  } catch (error) {
    console.error('记录浏览历史失败:', error)
  }
  emit('open', props.item)
}

onMounted(async () => {
  setupIntersectionObserver()

  // 加载评分
  try {
    rating.value = await window.rating.getRating(props.item.path || '', ns.value)
  } catch (error) {
    console.error('加载评分失败:', error)
  }
})

// 条目从 loading 态就绪后加载封面
watch(
  () => props.item.state,
  (newState, oldState) => {
    if (oldState === 'loading' && newState !== 'loading' && !hasCoverLoaded.value) {
      loadCoverInfo()
    }
  }
)

onUnmounted(() => {
  if (observer.value && cardRef.value) {
    observer.value.unobserve(cardRef.value)
    observer.value.disconnect()
    hasCoverLoaded.value = false
  }
})
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

/* 封面左上角评分 */
.cover-rating {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 2;
  padding: 1px 6px;
  border-radius: 5px;
  background: #00000071;
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  gap: 2px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
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
}
</style>

<template>
  <div class="image-reader">
    <ReaderControls
      :current-page="currentIndex + 1"
      :total-pages="totalPages"
      :show-auto-play="true"
      :is-auto-playing="isAutoPlaying"
      :show-zoom-controls="false"
      :zoom-percent="zoomLevel * 100"
      @back="goBack"
      @resetZoom="resetZoom"
      @toggleAutoPlay="toggleAutoPlay"
      @prev="prevPage"
      @next="nextPage"
      @progress-input="handleProgressChange"
    >
      <!-- 主图片显示区域（通过插槽渲染） -->
      <div class="image-container">
        <!-- 图片 -->
        <div
          v-if="currentImage && currentImage.loaded"
          class="image-wrapper"
          :style="imageTransformStyle"
        >
          <img
            :src="currentImage.src"
            :alt="currentImage.name"
            class="main-image"
            @dragstart.prevent
            @error="onImageError"
          />
        </div>

        <!-- 加载状态 -->
        <div
          v-if="loading || (currentImage && !currentImage.loaded && !currentImage.error)"
          class="loading-overlay"
        >
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p class="loading-text">{{ loading ? '初始化中...' : '加载图片中...' }}</p>
          </div>
        </div>

        <!-- 错误状态 -->
        <div v-if="error || (currentImage && currentImage.error)" class="error-overlay">
          <div class="error-content">
            <div class="error-icon">⚠️</div>
            <p class="error-text">{{ error ? '加载图片列表失败' : '图片加载失败' }}</p>
            <button @click="error ? loadImageList() : retryCurrentImage()" class="retry-button">
              重试
            </button>
          </div>
        </div>
      </div>
    </ReaderControls>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import ReaderControls from './reader-controls.vue'
// Props
const props = defineProps<{
  folderPath: string
  currentPage?: number
}>()

// Emits
const emits = defineEmits<{
  'update:currentPage': [page: number]
}>()

const router = useRouter()
const message = useMessage()

// 缓存配置
const CACHE_SIZE = 5
const PRELOAD_SIZE = 2

const AUTO_PLAY_INTERVAL = 3000

// 图片缓存接口
interface ImageCacheItem {
  src: string
  loaded: boolean
  error: boolean
  loading: boolean
}

// 状态管理
const imageList = ref<Array<{ name: string; path: string }>>([])
const imageCache = ref<Map<number, ImageCacheItem>>(new Map())
const currentIndex = ref(0)
const zoomLevel = ref(1)
const loading = ref(true)
const error = ref(false)

// UI 状态

const isAutoPlaying = ref(false)

const autoPlayTimer = ref<NodeJS.Timeout | null>(null)

// 计算属性
const currentImage = computed(() => {
  const imageInfo = imageList.value[currentIndex.value]
  const cachedImage = imageCache.value.get(currentIndex.value)

  if (!imageInfo) return null

  return {
    name: imageInfo.name,
    path: imageInfo.path,
    src: cachedImage?.src || '',
    loaded: cachedImage?.loaded || false,
    error: cachedImage?.error || false,
    loading: cachedImage?.loading || false
  }
})

const totalPages = computed(() => imageList.value.length)

const imageTransformStyle = computed(() => ({
  transform: `scale(${zoomLevel.value})`,
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}))

// 自动播放功能
const toggleAutoPlay = () => {
  if (isAutoPlaying.value) {
    stopAutoPlay()
  } else {
    startAutoPlay()
  }
}

const startAutoPlay = () => {
  if (currentIndex.value >= totalPages.value - 1) {
    currentIndex.value = 0
  }

  isAutoPlaying.value = true
  autoPlayTimer.value = setInterval(() => {
    if (currentIndex.value < totalPages.value - 1) {
      nextPage()
    } else {
      stopAutoPlay()
    }
  }, AUTO_PLAY_INTERVAL)
}

const stopAutoPlay = () => {
  isAutoPlaying.value = false
  if (autoPlayTimer.value) {
    clearInterval(autoPlayTimer.value)
    autoPlayTimer.value = null
  }
}
// 进度条变化处理
const handleProgressChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const newIndex = parseInt(target.value) - 1
  jumpToPage(newIndex)
}

// 进度条拖动事件处理

// 图片加载相关方法（保持原有的懒加载逻辑）
const loadImageList = async () => {
  try {
    loading.value = true
    error.value = false

    const imageFiles = await window.book.getFiles(props.folderPath)

    if (imageFiles.length === 0) {
      message.warning('该文件夹中没有找到图片文件')
      router.back()
      return
    }

    imageList.value = imageFiles.map((file) => ({
      name: file.name,
      path: file.fullPath,
      extension: file.extension
    }))

    if (props.currentPage && props.currentPage > 0 && props.currentPage <= imageList.value.length) {
      currentIndex.value = props.currentPage - 1
    }

    loading.value = false
    await preloadImages()
  } catch (err) {
    console.error('加载图片列表失败:', err)
    error.value = true
    loading.value = false
    message.error('加载图片列表失败')
  }
}

const preloadImages = async () => {
  const startIndex = Math.max(0, currentIndex.value - PRELOAD_SIZE)
  const endIndex = Math.min(imageList.value.length - 1, currentIndex.value + PRELOAD_SIZE)

  await loadImage(currentIndex.value)

  const promises: Promise<void>[] = []
  for (let i = startIndex; i <= endIndex; i++) {
    if (i !== currentIndex.value) {
      promises.push(loadImage(i))
    }
  }

  Promise.allSettled(promises)
}

const loadImage = async (index: number): Promise<void> => {
  if (index < 0 || index >= imageList.value.length) return

  const imageInfo = imageList.value[index]
  if (!imageInfo) return

  const cached = imageCache.value.get(index)
  if (cached && (cached.loaded || cached.loading)) return

  imageCache.value.set(index, {
    src: '',
    loaded: false,
    error: false,
    loading: true
  })

  return new Promise((resolve) => {
    const img = new Image()

    img.onload = () => {
      const src = `file://${imageInfo.path}`
      imageCache.value.set(index, {
        src,
        loaded: true,
        error: false,
        loading: false
      })
      resolve()
    }

    img.onerror = () => {
      imageCache.value.set(index, {
        src: '',
        loaded: false,
        error: true,
        loading: false
      })
      resolve()
    }

    img.src = `file://${imageInfo.path}`
  })
}

const cleanupCache = () => {
  const keepStart = Math.max(0, currentIndex.value - CACHE_SIZE)
  const keepEnd = Math.min(imageList.value.length - 1, currentIndex.value + CACHE_SIZE)

  const keysToDelete: number[] = []
  imageCache.value.forEach((_, index) => {
    if (index < keepStart || index > keepEnd) {
      keysToDelete.push(index)
    }
  })

  keysToDelete.forEach((key) => {
    imageCache.value.delete(key)
  })
}

// 防抖定时器
let jumpToPageTimer: NodeJS.Timeout | null = null

const jumpToPage = async (index: number) => {
  if (index < 0 || index >= imageList.value.length) return

  // 清除之前的定时器
  if (jumpToPageTimer) {
    clearTimeout(jumpToPageTimer)
  }

  // 设置新的防抖定时器
  jumpToPageTimer = setTimeout(async () => {
    currentIndex.value = index
    zoomLevel.value = 1 // 先重置为1，等图片加载完成后自动适应
    cleanupCache()
    preloadImages()
    jumpToPageTimer = null
  }, 100) // 100ms 防抖延迟
}

const nextPage = async () => {
  if (currentIndex.value < imageList.value.length - 1) {
    await jumpToPage(currentIndex.value + 1)
  }
}

const prevPage = async () => {
  if (currentIndex.value > 0) {
    await jumpToPage(currentIndex.value - 1)
  }
}

const retryCurrentImage = async () => {
  imageCache.value.delete(currentIndex.value)
  await loadImage(currentIndex.value)
}

// 缩放功能
const zoomIn = () => {
  zoomLevel.value = Math.min(zoomLevel.value * 1.2, 5)
}

const zoomOut = () => {
  zoomLevel.value = Math.max(zoomLevel.value / 1.2, 0.1)
}

const resetZoom = () => {
  zoomLevel.value = 1
}

// 键盘事件

// 返回功能
const goBack = () => {
  stopAutoPlay()
  router.back()
}

const onImageError = () => {
  // 图片加载错误后的处理
}

// 监听器
watch(currentIndex, (newIndex) => {
  emits('update:currentPage', newIndex + 1)
})

// 生命周期
onMounted(() => {
  loadImageList()
})

onUnmounted(() => {
  stopAutoPlay()
  imageCache.value.clear()
})
</script>

<style lang="scss" scoped>
.image-reader {
  @apply w-full h-full relative overflow-hidden;
  background: #1a1a1a;
  cursor: none;

  &:hover {
    cursor: default;
  }

  /* 主图片容器 */
  .image-container {
    @apply w-full h-full flex items-center justify-center relative;
  }

  .image-wrapper {
    @apply flex items-center justify-center w-full h-full;
    transform-origin: center center;
  }

  .main-image {
    @apply w-full h-full object-contain select-none;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

  /* 加载状态 */
  .loading-overlay {
    @apply absolute inset-0 flex items-center justify-center;
    background: rgba(26, 26, 26, 0.8);

    .loading-content {
      @apply text-center text-white;

      .loading-spinner {
        @apply w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4;
      }

      .loading-text {
        @apply text-lg;
      }
    }
  }

  /* 错误状态 */
  .error-overlay {
    @apply absolute inset-0 flex items-center justify-center;
    background: rgba(26, 26, 26, 0.8);

    .error-content {
      @apply text-center text-white;

      .error-icon {
        @apply text-6xl mb-4;
      }

      .error-text {
        @apply text-lg mb-4;
      }

      .retry-button {
        @apply px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors;
      }
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .desktop-only {
      display: none;
    }
  }

  @media (max-width: 480px) { }

  /* 滚动条隐藏 */
  &::-webkit-scrollbar {
    display: none;
  }
}

/* 全屏时的样式调整 */
:fullscreen {
  .image-reader {
    background: #000;
  }
}
</style>

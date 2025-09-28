<template>
  <div
    class="image-reader"
    @mousemove="handleMouseMove"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- 主图片显示区域 -->
    <div class="image-container" @wheel="handleWheel">
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

    <!-- 顶部控制栏 -->
    <div class="top-controls" :class="{ 'controls-hidden': !showControls }">
      <!-- 返回按钮 -->
      <button class="control-button back-button" @click="goBack">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>

      <!-- 页码显示 -->
      <div class="page-indicator">{{ currentIndex + 1 }} / {{ totalPages }}</div>

      <!-- 功能按钮组 -->
      <div class="function-buttons">
        <!-- 全屏按钮 -->
        <button class="control-button" @click="toggleFullscreen" title="全屏 (双击)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
          </svg>
        </button>

        <!-- 自动播放按钮 -->
        <button
          class="control-button"
          @click="toggleAutoPlay"
          :title="isAutoPlaying ? '暂停 (空格)' : '播放 (空格)'"
        >
          <svg v-if="!isAutoPlaying" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>

        <!-- 缩放重置按钮 -->
        <button class="control-button" @click="resetZoom" title="适应屏幕">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- 底部进度条 -->
    <div class="bottom-progress" :class="{ 'controls-hidden': !showControls }">
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: `${((currentIndex + 1) / totalPages) * 100}%` }"
        ></div>
        <input
          type="range"
          class="progress-slider"
          :min="1"
          :max="totalPages"
          :value="currentIndex + 1"
          @input="handleProgressChange"
          @mousedown="handleProgressMouseDown"
          @mousemove="handleProgressMouseMove"
          @mouseup="handleProgressMouseUp"
          @mouseleave="handleProgressMouseUp"
        />
      </div>
    </div>

    <!-- 进度提示框 -->
    <div
      v-if="progressTooltip.show"
      class="progress-tooltip"
      :style="{
        left: `${progressTooltip.x}px`,
        top: `${progressTooltip.y}px`
      }"
    >
      {{ progressTooltip.page }} / {{ totalPages }}
    </div>

    <!-- 左右切换按钮 -->
    <button
      class="nav-button nav-left"
      :class="{ 'controls-hidden': !showControls, disabled: currentIndex <= 0 }"
      @click="prevPage"
      :disabled="currentIndex <= 0"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
      </svg>
    </button>

    <button
      class="nav-button nav-right"
      :class="{ 'controls-hidden': !showControls, disabled: currentIndex >= totalPages - 1 }"
      @click="nextPage"
      :disabled="currentIndex >= totalPages - 1"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
      </svg>
    </button>
    <!-- 快捷键提示（桌面端） -->
    <div class="keyboard-hints desktop-only" :class="{ 'controls-hidden': !showControls }">
      <div class="hint-item">← → 切换</div>
      <div class="hint-item">滚轮缩放</div>
      <div class="hint-item">ESC 退出</div>
      <div class="hint-item">空格 播放</div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
const AUTO_HIDE_DELAY = 3000
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
const showControls = ref(true)
const isFullscreen = ref(false)
const isAutoPlaying = ref(false)
const autoHideTimer = ref<NodeJS.Timeout | null>(null)
const autoPlayTimer = ref<NodeJS.Timeout | null>(null)

// 触摸相关
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchStartDistance = ref(0)
const initialZoom = ref(1)

// 进度提示框状态
const progressTooltip = ref({
  show: false,
  x: 0,
  y: 0,
  page: 1
})
const isDraggingProgress = ref(false)

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

// 控制元素显示/隐藏
const showControlsTemporarily = () => {
  showControls.value = true
  resetAutoHideTimer()
}

const resetAutoHideTimer = () => {
  if (autoHideTimer.value) {
    clearTimeout(autoHideTimer.value)
  }
  autoHideTimer.value = setTimeout(() => {
    showControls.value = false
  }, AUTO_HIDE_DELAY)
}

// 鼠标移动处理
const handleMouseMove = () => {
  showControlsTemporarily()
}

// 全屏功能
const toggleFullscreen = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      isFullscreen.value = true
    } else {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
  } catch (err) {
    console.warn('全屏操作失败:', err)
  }
}

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

// 触摸事件处理
const handleTouchStart = (event: TouchEvent) => {
  showControlsTemporarily()

  if (event.touches.length === 1) {
    touchStartX.value = event.touches[0].clientX
    touchStartY.value = event.touches[0].clientY
  } else if (event.touches.length === 2) {
    const touch1 = event.touches[0]
    const touch2 = event.touches[1]
    touchStartDistance.value = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )
    initialZoom.value = zoomLevel.value
  }
}

const handleTouchMove = (event: TouchEvent) => {
  event.preventDefault()

  if (event.touches.length === 2) {
    const touch1 = event.touches[0]
    const touch2 = event.touches[1]
    const currentDistance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )

    const scale = currentDistance / touchStartDistance.value
    zoomLevel.value = Math.max(0.1, Math.min(5, initialZoom.value * scale))
  }
}

const handleTouchEnd = (event: TouchEvent) => {
  if (event.changedTouches.length === 1 && event.touches.length === 0) {
    const touchEndX = event.changedTouches[0].clientX
    const touchEndY = event.changedTouches[0].clientY

    const deltaX = touchEndX - touchStartX.value
    const deltaY = touchEndY - touchStartY.value

    // 水平滑动切换图片
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        prevPage()
      } else {
        nextPage()
      }
    }
  }
}

// 进度条变化处理
const handleProgressChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const newIndex = parseInt(target.value) - 1
  jumpToPage(newIndex)
}

// 进度条拖动事件处理
const handleProgressMouseDown = (event: MouseEvent) => {
  isDraggingProgress.value = true
  updateProgressTooltip(event)
}

const handleProgressMouseMove = (event: MouseEvent) => {
  if (isDraggingProgress.value) {
    updateProgressTooltip(event)
  }
}

const handleProgressMouseUp = () => {
  isDraggingProgress.value = false
  progressTooltip.value.show = false
}

const updateProgressTooltip = (event: MouseEvent) => {
  const target = event.target as HTMLInputElement
  const rect = target.getBoundingClientRect()
  const percentage = (event.clientX - rect.left) / rect.width
  const clampedPercentage = Math.max(0, Math.min(1, percentage))
  const page = Math.round(clampedPercentage * (totalPages.value - 1)) + 1

  progressTooltip.value = {
    show: true,
    x: event.clientX,
    y: rect.top - 40, // 在进度条上方40px显示
    page: Math.max(1, Math.min(totalPages.value, page))
  }
}

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
  showControlsTemporarily()
}

const zoomOut = () => {
  zoomLevel.value = Math.max(zoomLevel.value / 1.2, 0.1)
  showControlsTemporarily()
}

const resetZoom = () => {
  zoomLevel.value = 1
}

const handleWheel = (event: WheelEvent) => {
  event.preventDefault()
  showControlsTemporarily()

  if (event.deltaY < 0) {
    zoomIn()
  } else {
    zoomOut()
  }
}

// 键盘事件
const handleKeydown = (event: KeyboardEvent) => {
  showControlsTemporarily()

  switch (event.key) {
    case 'ArrowLeft':
      prevPage()
      break
    case 'ArrowRight':
      nextPage()
      break
    case 'Escape':
      if (isFullscreen.value) {
        toggleFullscreen()
      } else {
        goBack()
      }
      break
    case ' ':
      event.preventDefault()
      toggleAutoPlay()
      break
    case '+':
    case '=':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomIn()
      }
      break
    case '-':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomOut()
      }
      break
    case '0':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        resetZoom()
      }
      break
  }
}

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
  document.addEventListener('keydown', handleKeydown)
  resetAutoHideTimer()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  stopAutoPlay()
  if (autoHideTimer.value) {
    clearTimeout(autoHideTimer.value)
  }
  imageCache.value.clear()
})
</script>

<style scoped>
.image-reader {
  @apply w-full h-full relative overflow-hidden;
  background: #1a1a1a;
  cursor: none;
}

.image-reader:hover {
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
}

.loading-content {
  @apply text-center text-white;
}

.loading-spinner {
  @apply w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4;
}

.loading-text {
  @apply text-lg;
}

/* 错误状态 */
.error-overlay {
  @apply absolute inset-0 flex items-center justify-center;
  background: rgba(26, 26, 26, 0.8);
}

.error-content {
  @apply text-center text-white;
}

.error-icon {
  @apply text-6xl mb-4;
}

.error-text {
  @apply text-lg mb-4;
}

.retry-button {
  @apply px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors;
}

/* 顶部控制栏 */
.top-controls {
  @apply absolute top-0 left-0 right-0 flex items-center justify-between p-6 z-10;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.top-controls.controls-hidden {
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
}

.control-button {
  @apply flex items-center justify-center w-10 h-10 text-white rounded-lg transition-all duration-200;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.control-button:hover {
  background: rgba(0, 0, 0, 0.6);
  transform: scale(1.05);
}

.back-button {
  @apply w-12 h-12;
}

.page-indicator {
  @apply text-white text-xl font-medium px-4 py-2 rounded-lg;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.function-buttons {
  @apply flex items-center space-x-3;
}

/* 底部进度条 */
.bottom-progress {
  @apply absolute bottom-0 left-0 right-0 p-6 z-10;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  height: 100px;
}

.bottom-progress.controls-hidden {
  opacity: 0;
  transform: translateY(100%);
  pointer-events: none;
}

.progress-bar {
  @apply relative mb-3;
}

.progress-fill {
  @apply h-1 bg-blue-500 rounded-full transition-all duration-300;
  background: #4a90e2;
}

.progress-slider {
  @apply absolute inset-0 w-full h-1 opacity-0 cursor-pointer;
}

/* 进度提示框 */
.progress-tooltip {
  @apply fixed z-50 px-3 py-2 text-white text-sm font-medium rounded-lg pointer-events-none;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  transform: translateX(-50%);
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.progress-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: rgba(0, 0, 0, 0.8);
}

.progress-info {
  @apply flex items-center justify-between text-white text-sm;
}

.image-name {
  @apply truncate max-w-xs;
}

.zoom-info {
  @apply px-2 py-1 rounded;
  background: rgba(0, 0, 0, 0.4);
}

/* 导航按钮 */
.nav-button {
  @apply absolute top-1/2 transform -translate-y-1/2 w-16 h-16 flex items-center justify-center text-white rounded-full transition-all duration-200 z-10;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.nav-button:hover:not(.disabled) {
  background: rgba(0, 0, 0, 0.6);
  transform: translateY(-50%) scale(1.1);
}

.nav-button.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-left {
  left: 2rem;
}

.nav-right {
  right: 2rem;
}

.nav-button.controls-hidden {
  opacity: 0;
  pointer-events: none;
}

/* 缩放控制 */
.zoom-controls {
  @apply absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col space-y-2 z-10;
  transition: opacity 0.3s ease;
}

.zoom-controls.controls-hidden {
  opacity: 0;
  pointer-events: none;
}

.zoom-button {
  @apply w-10 h-10 flex items-center justify-center text-white rounded-lg transition-all duration-200;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.zoom-button:hover {
  background: rgba(0, 0, 0, 0.6);
  transform: scale(1.05);
}

/* 快捷键提示 */
.keyboard-hints {
  @apply absolute bottom-6 left-6 flex space-x-4 text-white text-xs z-10;
  transition: opacity 0.3s ease;
}

.keyboard-hints.controls-hidden {
  opacity: 0;
}

.hint-item {
  @apply px-2 py-1 rounded;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .desktop-only {
    display: none;
  }

  .top-controls {
    @apply p-4;
  }

  .bottom-progress {
    @apply p-4;
  }

  .nav-button {
    @apply w-12 h-12;
  }

  .nav-left {
    left: 1rem;
  }

  .nav-right {
    right: 1rem;
  }

  .page-indicator {
    @apply text-lg;
  }
}

@media (max-width: 480px) {
  .function-buttons {
    @apply space-x-2;
  }

  .control-button {
    @apply w-8 h-8;
  }

  .back-button {
    @apply w-10 h-10;
  }
}

/* 滚动条隐藏 */
::-webkit-scrollbar {
  display: none;
}

/* 全屏时的样式调整 */
:fullscreen .image-reader {
  background: #000;
}
</style>

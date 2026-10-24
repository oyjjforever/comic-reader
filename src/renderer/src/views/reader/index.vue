<template>
  <div class="general-reader">
    <reader-controls
      :current-page="page.index + 1"
      :total-pages="page.total"
      :show-auto-play="true"
      :is-auto-playing="isAutoPlaying"
      :show-zoom-controls="false"
      :zoom-percent="zoomLevel * 100"
      :show-rating="showRating"
      :rating="currentRating"
      :show-progress="showProgressBar"
      :disabled-prev="page.index <= 0 && !props.hasPrev"
      :disabled-next="page.index >= page.total - pagesPerView && !props.hasNext"
      :has-next="props.hasNext"
      :has-prev="props.hasPrev"
      :page-label="pageLabel"
      @back="goBack"
      @toggleFullscreen="toggleFullscreen"
      @toggleAutoPlay="toggleAutoPlay"
      @prev="prevPage"
      @next="nextPage"
      @rate="onRate"
      @page-jump="handlePageJump"
      @progress-input="handleProgressChange"
      @toggleProgress="toggleProgressBar"
    >
      <!-- 双页模式切换（仅图片阅读时显示） -->
      <template v-if="isImageReading" #right-extra>
        <button
          class="control-button"
          :class="{ active: doublePageMode }"
          :title="doublePageMode ? '切换为单页模式' : '切换为双页模式'"
          @click="toggleDoublePage"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5h8v14H3V5zm10 0h8v14h-8V5z" />
          </svg>
        </button>
      </template>
      <div class="reader-container">
        <component :is="readerComponent" :file="currentFile" :next-file="nextFileInPair"></component>
      </div>
    </reader-controls>
  </div>
</template>

<script setup lang="ts">
import epubReader from './type/epub.vue'
import imageReader from './type/image.vue'
import pdfReader from './type/pdf.vue'
import videoReader from './type/video/index.vue'
import readerControls from './reader-controls.vue'
import { showProgressBar, doublePageMode, setShowReaderProgress, setDoublePageMode } from './reader-state'
import { useMessage } from 'naive-ui'
import { reactive } from 'vue'

interface ReaderProps {
  folderPath?: string
  filePath?: string
  hasNext?: boolean
  hasPrev?: boolean
  module?: string
}

const props = withDefaults(defineProps<ReaderProps>(), {
  hasNext: false,
  hasPrev: false,
  module: ''
})
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'next'): void
  (e: 'prev'): void
}>()

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico']

const route = useRoute()
const router = useRouter()
const message = useMessage()
const AUTO_PLAY_INTERVAL = 3000
const readerComponent = computed(() => {
  if (IMAGE_EXTENSIONS.includes(currentFile.value.extension)) return imageReader
  else if (currentFile.value.extension === '.pdf') return pdfReader
  else if (currentFile.value.extension === '.mp4') return videoReader
  else if (currentFile.value.extension === '.epub') return epubReader
  return imageReader
})
// 双页模式：仅图片阅读时生效，一次翻动两页
const isImageReading = computed(() => readerComponent.value === imageReader)
const pagesPerView = computed(() =>
  doublePageMode.value && isImageReading.value ? 2 : 1
)
// 双页模式下与当前页配对显示的下一页（不存在或非图片则为空，如最后一页）
const nextFileInPair = computed(() => {
  if (pagesPerView.value !== 2) return undefined
  const next = page.list[page.index + 1]
  return next && IMAGE_EXTENSIONS.includes(next.extension) ? next : undefined
})
// 页码显示文案：双页时显示 "2-3 / 46" 形式
const pageLabel = computed(() => {
  if (pagesPerView.value !== 2) return undefined
  const first = page.index + 1
  return nextFileInPair.value ? `${first}-${first + 1} / ${page.total}` : `${first} / ${page.total}`
})
const toggleDoublePage = () => {
  setDoublePageMode(!doublePageMode.value)
  // 切换后将当前页重新对齐到双页对的起点
  jumpToPage(page.index)
}
const isAutoPlaying = ref(false)
const zoomLevel = ref(1)
const page = reactive({
  list: [] as any[],
  index: 0,
  total: 0
})
let currentFile = ref<any>({})

// 评分相关
const workPath = computed(() => {
  const raw = props.folderPath || props.filePath || ''
  try {
    return raw ? decodeURIComponent(raw) : ''
  } catch {
    return raw
  }
})
const showRating = computed(() => !!props.module && !!workPath.value)
const currentRating = ref(0)

async function loadRating() {
  if (!showRating.value) {
    currentRating.value = 0
    return
  }
  try {
    currentRating.value = await window.rating.getRating(workPath.value, props.module)
  } catch (e) {
    console.error('加载评分失败:', e)
    currentRating.value = 0
  }
}

async function onRate(value: number) {
  if (!showRating.value) return
  currentRating.value = value
  try {
    await window.rating.setRating(workPath.value, props.module, value)
  } catch (e) {
    console.error('保存评分失败:', e)
  }
}

watch(workPath, () => {
  loadRating()
})

onMounted(() => {
  fetchData()
  loadRating()
  window.addEventListener('mousedown', handleMouseDown)
})
onUnmounted(() => {
  stopAutoPlay()
  window.removeEventListener('mousedown', handleMouseDown)
})
const handleMouseDown = (e: MouseEvent) => {
  if (e.button === 3) {
    e.preventDefault()
    emit('close')
  }
}

const fetchData = async () => {
  try {
    // 优先使用 props，其次使用 route query（兼容路由模式）
    const folderPath = props.folderPath || (route.query.folderPath as string)
    const filePath = props.filePath || (route.query.filePath as string)

    if (folderPath) {
      page.list = await window.media.getFiles(decodeURIComponent(folderPath))
      page.total = page.list.length
    }
    if (filePath) {
      page.list = [await window.file.getFileInfo(decodeURIComponent(filePath))]
      page.total = 1
    }
    jumpToPage(0)
  } catch (error: any) {
    message.error(error.message)
    // 返回上一页
    goBack()
  }
}

const autoPlayTimer = ref<NodeJS.Timeout | null>(null)

// 最后一页/第一页提示相关
const nextHintShown = ref(false)
let nextHintTimer: ReturnType<typeof setTimeout> | null = null
const prevHintShown = ref(false)
let prevHintTimer: ReturnType<typeof setTimeout> | null = null

const jumpToPage = async (index: number) => {
  if (index < 0 || index >= page.total) return
  // 双页模式按偶数索引对齐：每次显示 index 与 index+1 两页
  if (pagesPerView.value === 2) {
    index = Math.floor(index / 2) * 2
  }
  page.index = index
  currentFile.value = page.list[index]
}
const nextPage = async () => {
  const target = Math.min(page.index + pagesPerView.value, page.total - 1)
  if (page.index < page.total - 1) {
    nextHintShown.value = false
    await jumpToPage(target)
  } else if (props.hasNext) {
    // 已是最后一页，且有下一篇
    if (nextHintShown.value) {
      // 第二次触发，进入下一篇
      nextHintShown.value = false
      if (nextHintTimer) {
        clearTimeout(nextHintTimer)
        nextHintTimer = null
      }
      emit('next')
    } else {
      // 第一次触发，显示提示
      nextHintShown.value = true
      message.info('已是最后一页，再次操作将进入下一篇', { duration: 3000 })
      // 3秒后自动重置提示状态
      nextHintTimer = setTimeout(() => {
        nextHintShown.value = false
      }, 3000)
    }
  }
}
const prevPage = async () => {
  const target = Math.max(page.index - pagesPerView.value, 0)
  if (page.index > 0) {
    prevHintShown.value = false
    await jumpToPage(target)
  } else if (props.hasPrev) {
    // 已是第一页，且有上一篇
    if (prevHintShown.value) {
      // 第二次触发，进入上一篇
      prevHintShown.value = false
      if (prevHintTimer) {
        clearTimeout(prevHintTimer)
        prevHintTimer = null
      }
      emit('prev')
    } else {
      // 第一次触发，显示提示
      prevHintShown.value = true
      message.info('已是第一页，再次操作将进入上一篇', { duration: 3000 })
      // 3秒后自动重置提示状态
      prevHintTimer = setTimeout(() => {
        prevHintShown.value = false
      }, 3000)
    }
  }
}
// 进度条变化处理
const handleProgressChange = (event: Event) => {
  const target = event.target
  const newIndex = parseInt(target.value) - 1
  jumpToPage(newIndex)
}
// 页码直接跳转
const handlePageJump = (page: number) => {
  jumpToPage(page - 1)
}
// 自动播放功能
const toggleAutoPlay = () => {
  if (isAutoPlaying.value) {
    stopAutoPlay()
  } else {
    startAutoPlay()
  }
}
// 进度条显示开关：同步写入设置
const toggleProgressBar = () => {
  setShowReaderProgress(!showProgressBar.value)
}
const startAutoPlay = () => {
  if (page.index >= page.total - 1) {
    page.index = 0
  }

  isAutoPlaying.value = true
  autoPlayTimer.value = setInterval(() => {
    if (page.index < page.total - 1) {
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
// 全屏功能
const toggleFullscreen = () => {
  const readerElement = document.querySelector('.general-reader')
  if (!document.fullscreenElement) {
    readerElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// 返回功能
const goBack = () => {
  stopAutoPlay()
  // 优先使用 emit close（覆盖层模式），其次使用 router.back()（路由模式）
  emit('close')
  // 如果不是通过 props 传入的路径，说明是路由模式，需要返回
  if (!props.folderPath && !props.filePath) {
    router.back()
  }
}
</script>

<style lang="scss" scoped>
.general-reader {
  height: 100%;
  width: 100%;
  .reader-container {
    height: 100%;
    width: 100%;
  }

  /* 双页切换按钮：投送到 reader-controls 顶栏插槽，插槽内容不吃其 scoped 样式，需自带样式 */
  .control-button {
    @apply flex items-center justify-center w-10 h-10 text-white rounded-lg transition-all duration-200;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);

    &:hover {
      background: rgba(0, 0, 0, 0.6);
      transform: scale(1.05);
    }

    &.active {
      background: rgba(255, 255, 255, 0.25);
    }
  }
}
</style>

<template>
  <div class="general-reader" @click="onReaderRootClick">
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
      :wheel-passthrough="isImageReading && isScrollMode"
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
      <!-- 阅读设置按钮（仅图片阅读时显示）：hover 弹出设置面板 -->
      <template v-if="isImageReading" #right-extra>
        <button
          class="control-button"
          :class="{ active: showReaderSettings }"
          title="阅读设置"
          @mouseenter="onSettingsButtonEnter"
          @mouseleave="onSettingsButtonLeave"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
            />
          </svg>
        </button>
      </template>
      <div class="reader-container">
        <component
          :is="readerComponent"
          :file="currentFile"
          :next-file="nextFileInPair"
          :list="page.list"
          @scroll-page="handleScrollPage"
        ></component>
      </div>
    </reader-controls>

    <!-- 阅读设置面板：顶栏下方浮层，hover 按钮显示，鼠标离开按钮/面板后收起 -->
    <transition name="reader-settings">
      <div
        v-if="showReaderSettings && isImageReading"
        class="reader-settings"
        @mouseenter="onSettingsPanelEnter"
        @mouseleave="onSettingsPanelLeave"
      >
        <div class="reader-settings__row">
          <span class="reader-settings__label">阅读模式</span>
          <div class="reader-settings__options">
            <button :class="{ active: !isScrollMode }" @click="onSetReadingMode('page')">
              左右翻页
            </button>
            <button :class="{ active: isScrollMode }" @click="onSetReadingMode('scroll')">
              上下滚动
            </button>
          </div>
        </div>
        <div class="reader-settings__row" :class="{ 'row-disabled': isScrollMode }">
          <span class="reader-settings__label">页面模式</span>
          <div class="reader-settings__options">
            <button :class="{ active: !doublePageMode }" @click="onSetDoublePage(false)">
              单页
            </button>
            <button :class="{ active: doublePageMode }" @click="onSetDoublePage(true)">
              双页
            </button>
          </div>
        </div>
        <div class="reader-settings__row" :class="{ 'row-disabled': isScrollMode }">
          <span class="reader-settings__label">翻页方向</span>
          <div class="reader-settings__options">
            <button :class="{ active: !isManga }" @click="onSetPageDirection('normal')">
              普通模式
            </button>
            <button :class="{ active: isManga }" @click="onSetPageDirection('manga')">
              日漫模式
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 缩略图抽屉：挂在根容器（reader-controls 内祖先有 transform 且根节点劫持 wheel，
         放里面会导致全屏 fixed 失效、面板滚动变翻页） -->
    <thumbnail-panel
      v-if="thumbFolderPath && page.total > 1"
      :folder-path="thumbFolderPath"
      :folder-name="thumbFolderName"
      :current-paths="thumbCurrentPaths"
      @jump="onThumbJump"
    />
  </div>
</template>

<script setup lang="ts">
import epubReader from './type/epub.vue'
import imageReader from './type/image.vue'
import pdfReader from './type/pdf.vue'
import videoReader from './type/video/index.vue'
import readerControls from './reader-controls.vue'
import ThumbnailPanel from '@renderer/components/thumbnail-panel.vue'
import {
  showProgressBar,
  doublePageMode,
  setShowReaderProgress,
  setDoublePageMode,
  autoPlayInterval,
  readingMode,
  setReadingMode,
  pageDirection,
  setPageDirection
} from './reader-state'
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
const readerComponent = computed(() => {
  if (IMAGE_EXTENSIONS.includes(currentFile.value.extension)) return imageReader
  else if (currentFile.value.extension === '.pdf') return pdfReader
  else if (currentFile.value.extension === '.mp4') return videoReader
  else if (currentFile.value.extension === '.epub') return epubReader
  return imageReader
})
// 双页模式：仅图片阅读时生效，一次翻动两页（上下滚动模式下不生效）
const isImageReading = computed(() => readerComponent.value === imageReader)
const isScrollMode = computed(() => readingMode.value === 'scroll')
const isManga = computed(() => pageDirection.value === 'manga')
const pagesPerView = computed(() =>
  doublePageMode.value && isImageReading.value && !isScrollMode.value ? 2 : 1
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
// ===== 缩略图面板（文件夹模式多页作品） =====
const thumbFolderPath = computed(() => {
  const raw = props.folderPath || (route.query.folderPath as string) || ''
  try {
    return raw ? decodeURIComponent(raw) : ''
  } catch {
    return raw
  }
})
// 当前阅读文件（双页模式含配对页，面板同时高亮两张）
const thumbCurrentPaths = computed(() => {
  if (doublePageMode.value && isImageReading.value && nextFileInPair.value) {
    return [currentFile.value?.fullPath, nextFileInPair.value.fullPath].filter(Boolean)
  }
  return currentFile.value?.fullPath ? [currentFile.value.fullPath] : []
})

const thumbFolderName = computed(() => {
  const p = thumbFolderPath.value.replace(/[\\/]+$/, '')
  const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return idx > 0 ? p.slice(idx + 1) : p || '缩略图'
})

/** 点击缩略图：跳到该文件所在页 */
const onThumbJump = (fullPath: string) => {
  const idx = page.list.findIndex((f: any) => f.fullPath === fullPath)
  if (idx >= 0) {
    jumpToPage(pagesPerView.value === 2 ? Math.floor(idx / 2) * 2 : idx)
  }
}

// ===== 阅读设置面板（仅图片阅读）：hover 触发 =====
const showReaderSettings = ref(false)
// 按钮与面板分别记录悬停态，两者都离开后延迟收起（避免经过按钮-面板间空隙时误关）
const settingsHover = reactive({ button: false, panel: false })
let settingsHideTimer: ReturnType<typeof setTimeout> | null = null

const updateSettingsPanelVisible = () => {
  if (settingsHideTimer) {
    clearTimeout(settingsHideTimer)
    settingsHideTimer = null
  }
  if (settingsHover.button || settingsHover.panel) {
    showReaderSettings.value = true
  } else {
    settingsHideTimer = setTimeout(() => {
      if (!settingsHover.button && !settingsHover.panel) {
        showReaderSettings.value = false
      }
    }, 150)
  }
}

const onSettingsButtonEnter = () => {
  settingsHover.button = true
  updateSettingsPanelVisible()
}
const onSettingsButtonLeave = () => {
  settingsHover.button = false
  updateSettingsPanelVisible()
}
const onSettingsPanelEnter = () => {
  settingsHover.panel = true
  updateSettingsPanelVisible()
}
const onSettingsPanelLeave = () => {
  settingsHover.panel = false
  updateSettingsPanelVisible()
}

// 点击设置面板与顶栏按钮以外的区域时收起面板
const onReaderRootClick = (ev: MouseEvent) => {
  if (!showReaderSettings.value) return
  const t = ev.target as Element
  if (!t.closest('.reader-settings') && !t.closest('.control-button')) {
    showReaderSettings.value = false
    settingsHover.button = false
    settingsHover.panel = false
  }
}
const onSetReadingMode = (mode: 'page' | 'scroll') => {
  setReadingMode(mode)
}
const onSetPageDirection = (dir: 'normal' | 'manga') => {
  setPageDirection(dir)
}
// 切换双页：开启时将当前页对齐到双页对的起点
const onSetDoublePage = (value: boolean) => {
  setDoublePageMode(value)
  if (value) jumpToPage(page.index)
}
// 上下滚动模式：滚动位置反算的当前页
const handleScrollPage = (index: number) => {
  jumpToPage(index)
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
  if (settingsHideTimer) {
    clearTimeout(settingsHideTimer)
    settingsHideTimer = null
  }
})
const handleMouseDown = (e: MouseEvent) => {
  // 鼠标侧键（后退 3 / 前进 4）关闭阅读器，与返回按钮同语义；
  // 侧键的历史回退手势由主进程 app-command 拦截，不会引起路由回退
  if (e.button === 3 || e.button === 4) {
    e.preventDefault()
    goBack()
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
const startAutoPlayTimer = () => {
  autoPlayTimer.value = setInterval(() => {
    if (page.index < page.total - 1) {
      nextPage()
    } else {
      stopAutoPlay()
    }
  }, autoPlayInterval.value)
}
const startAutoPlay = () => {
  if (page.index >= page.total - 1) {
    page.index = 0
  }

  isAutoPlaying.value = true
  startAutoPlayTimer()
}
// 播放中修改间隔设置立即生效
watch(autoPlayInterval, () => {
  if (isAutoPlaying.value && autoPlayTimer.value) {
    clearInterval(autoPlayTimer.value)
    startAutoPlayTimer()
  }
})
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
  position: relative;
  height: 100%;
  width: 100%;
  .reader-container {
    height: 100%;
    width: 100%;
  }

  /* 阅读设置面板：顶栏下方浮层 */
  .reader-settings {
    position: absolute;
    top: 58px;
    right: 16px;
    z-index: 200;
    width: 272px;
    padding: 4px 14px;
    border-radius: 12px;
    background: rgba(32, 32, 32, 0.96);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);

    &__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;

      & + & {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      /* 滚动模式下不适用的设置整行禁用 */
      &.row-disabled {
        opacity: 0.4;
        pointer-events: none;
      }
    }

    &__label {
      color: #eee;
      font-size: 14px;
    }

    &__options {
      display: flex;
      gap: 4px;
      padding: 3px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);

      button {
        padding: 4px 12px;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: #bbb;
        font-size: 12px;
        cursor: pointer;
        transition:
          background 0.2s,
          color 0.2s;

        &:hover {
          color: #fff;
        }

        &.active {
          background: #fff;
          color: #222;
        }
      }
    }
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

/* 设置面板出入场动画 */
.reader-settings-enter-active,
.reader-settings-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.reader-settings-enter-from,
.reader-settings-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>

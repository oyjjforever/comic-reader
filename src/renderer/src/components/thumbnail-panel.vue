<template>
  <div ref="rootEl" class="tp-root">
    <!-- 右缘拉手：收起态一个（拉开）；单列态两个（上：收起，下：全屏）；全屏态隐藏 -->
    <button
      v-if="mode === 'closed'"
      v-show="handleVisible"
      class="tp-handle tp-handle--solo"
      title="打开缩略图"
      @click="mode = 'column'; if (items.length === 0) load()"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
      </svg>
    </button>
    <button
      v-else-if="mode === 'column'"
      v-show="handleVisible"
      class="tp-handle tp-handle--attached"
      title="铺满全屏"
      @click="mode = 'full'"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
      </svg>
    </button>

    <!-- 面板：单列 / 全屏（wheel.stop 阻断外层翻页劫持，保留原生滚动） -->
    <div
      v-if="mode !== 'closed'"
      class="tp-panel"
      :class="{ 'tp-panel--full': mode === 'full' }"
      @wheel.stop
    >
      <div class="tp-header">
        <span class="tp-header__title" :title="folderName">{{ folderName || '缩略图' }}</span>
        <span class="tp-header__count">{{ items.length }} 项</span>
        <div class="tp-header__ops">
          <n-button v-if="mode === 'full'" size="tiny" quaternary title="收起为侧栏" @click="mode = 'column'">
            <template #icon>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 8H4V6h2V4h2v4zm8 0V4h2v2h2v2h-4zm0 8h4v2h-2v2h-2v-2zM8 16v4H6v-2H4v-2h4z" />
              </svg>
            </template>
          </n-button>
          <n-button size="tiny" quaternary title="关闭" @click="mode = 'closed'">
            <template #icon>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" />
              </svg>
            </template>
          </n-button>
        </div>
      </div>
      <n-spin :show="loading" size="small" class="tp-body">
        <div v-if="items.length" class="tp-list" :class="{ 'tp-list--full': mode === 'full' }">
          <div
            v-for="(item, i) in items"
            :key="item.fullPath"
            class="tp-item"
            :data-path="item.fullPath"
            :class="{ 'tp-item--current': currentPaths?.includes(item.fullPath) }"
            :title="item.name"
            @click="onItemClick(item.fullPath)"
          >
            <div class="tp-item__thumb" :ref="(el) => collectThumb(el, i)">
              <img v-if="item.src" :src="item.src" referrerpolicy="no-referrer" />
              <div v-else-if="item.loading" class="tp-item__placeholder">
                <n-spin size="small" />
              </div>
              <div v-else class="tp-item__placeholder tp-item__placeholder--file">
                <span>{{ item.ext.toUpperCase().slice(1) || 'FILE' }}</span>
              </div>
              <span v-if="item.isVideo" class="tp-item__video-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 5h13a2 2 0 0 1 2 2v2.5l4-2.5v10l-4-2.5V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
                </svg>
              </span>
            </div>
            <span class="tp-item__index">{{ i + 1 }}</span>
          </div>
        </div>
        <div v-else-if="!loading" class="tp-empty">该作品下没有可显示的媒体文件</div>
      </n-spin>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NSpin } from 'naive-ui'
import { ref, reactive, watch, nextTick, onBeforeUnmount } from 'vue'

interface ThumbItem {
  name: string
  fullPath: string
  ext: string
  isVideo: boolean
  isImage: boolean
  src: string
  loading: boolean
  tried: boolean
}

const props = defineProps<{
  folderPath: string
  folderName?: string
  /** 当前阅读的文件（高亮对应缩略图；双页模式为两张） */
  currentPaths?: string[]
}>()

const emit = defineEmits<{
  /** 点击某张缩略图：跳到该文件对应页 */
  (e: 'jump', fullPath: string): void
}>()

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.avif']
const VIDEO_EXTS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.ogg', '.ogv']

const extOf = (p: string) => {
  const i = p.lastIndexOf('.')
  return i === -1 ? '' : p.toLowerCase().slice(i)
}

// 抽屉三态：收起（仅右缘拉手）→ 单列 → 全屏（拉手隐藏，由头部按钮控制收回）
const mode = ref<'closed' | 'column' | 'full'>('closed')
const loading = ref(false)
const items = reactive<ThumbItem[]>([])

// 拉手仅在鼠标移入右侧区域时显示（收起态 70px；
// 单列态需覆盖面板 285px + 拉手 22px + 余量，否则移到拉手上就出区消失）
const PANEL_WIDTH = 285
const HANDLE_ZONE_COLUMN = PANEL_WIDTH + 22 + 43
const rootEl = ref<HTMLElement | null>(null)
const handleVisible = ref(false)
const onMouseMove = (e: MouseEvent) => {
  const el = rootEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const zone = mode.value === 'closed' ? 70 : HANDLE_ZONE_COLUMN
  handleVisible.value =
    e.clientX >= rect.right - zone &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
}
document.addEventListener('mousemove', onMouseMove)

// 单列态点击面板外任意区域 → 收起面板
const onDocMouseDown = (e: MouseEvent) => {
  if (mode.value !== 'column') return
  const el = rootEl.value
  if (el && e.target instanceof Node && !el.contains(e.target)) {
    mode.value = 'closed'
  }
}
document.addEventListener('mousedown', onDocMouseDown)

/** 点击缩略图：跳页；全屏态直接收起面板（不回单列） */
const onItemClick = (fullPath: string) => {
  emit('jump', fullPath)
  if (mode.value === 'full') mode.value = 'closed'
}

/** 滚动条定位到当前页对应的缩略图（打开/铺满时调用）。
 * 不用 scrollIntoView：它会连带滚动所有可滚动祖先（body/阅读器层），
 * 导致整个阅读画面偏移；这里只设置面板滚动容器自己的 scrollTop */
const scrollToCurrent = async () => {
  // 双页定位到左页（第一张）
  const target = props.currentPaths?.[0]
  if (!target || items.length === 0) return
  await nextTick()
  const root = rootEl.value
  if (!root) return
  const item = root.querySelector(
    `.tp-item[data-path="${CSS.escape(target)}"]`
  ) as HTMLElement | null
  const scroller = root.querySelector('.tp-body .n-spin-content') as HTMLElement | null
  if (!item || !scroller) return
  const delta =
    item.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    scroller.clientHeight / 2 +
    item.getBoundingClientRect().height / 2
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta)
}

// 打开/铺满时定位当前页
watch(mode, (m) => {
  if (m === 'column' || m === 'full') void scrollToCurrent()
})

// 视口懒加载：进入可视区才解析缩略图（图片直读 / 视频截帧）
let observer: IntersectionObserver | null = null

const collectThumb = (el: unknown, index: number) => {
  if (!(el instanceof HTMLElement)) return
  el.dataset.tpIndex = String(index)
  observer?.observe(el)
}

const ensureObserver = () => {
  if (observer) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        observer?.unobserve(el)
        const item = items[Number(el.dataset.tpIndex)]
        if (item && !item.tried) void resolveThumb(item)
      }
    },
    { rootMargin: '200px', threshold: 0.05 }
  )
}

/** 视频截帧生成缩略图（与 unified-media-card 相同策略：第 5 秒 + 封面缓存） */
const captureVideoThumb = (path: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = `file://${path}`
    video.muted = true
    video.crossOrigin = 'anonymous'
    const timer = setTimeout(() => reject(new Error('截帧超时')), 15000)
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(5, Math.max(0, (video.duration || 5) - 0.1))
    })
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx && ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        clearTimeout(timer)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch (e) {
        clearTimeout(timer)
        reject(e)
      }
    })
    video.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('视频加载失败'))
    })
  })
}

const resolveThumb = async (item: ThumbItem) => {
  item.tried = true
  if (item.isImage) {
    item.src = `file://${item.fullPath}`
    return
  }
  if (!item.isVideo) return
  item.loading = true
  try {
    // 优先封面缓存，未命中截帧并写缓存
    const cached = await window.videoCover.get(item.fullPath)
    if (cached) {
      item.src = `file://${cached}`
    } else {
      const dataUrl = await captureVideoThumb(item.fullPath)
      item.src = dataUrl
      window.videoCover
        .saveFromDataUrl(item.fullPath, dataUrl)
        .catch(() => undefined)
    }
  } catch {
    item.src = ''
  } finally {
    item.loading = false
  }
}

const load = async () => {
  if (!props.folderPath || loading.value) return
  ensureObserver()
  loading.value = true
  items.length = 0
  try {
    const files = await window.media.getFiles(props.folderPath)
    for (const f of files) {
      const ext = extOf(f.fullPath)
      items.push({
        name: f.name,
        fullPath: f.fullPath,
        ext,
        isImage: IMAGE_EXTS.includes(ext),
        isVideo: VIDEO_EXTS.includes(ext),
        src: '',
        loading: false,
        tried: false
      })
    }
    await nextTick()
    if (mode.value !== 'closed') void scrollToCurrent()
  } finally {
    loading.value = false
  }
}

// 换作品时收起并清空（下次点开重新加载）
watch(
  () => props.folderPath,
  () => {
    mode.value = 'closed'
    items.length = 0
  }
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mousedown', onDocMouseDown)
})

// Esc 逐级收起：全屏 → 单列 → 关闭
const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (mode.value === 'full') mode.value = 'column'
  else if (mode.value === 'column') mode.value = 'closed'
}
window.addEventListener('keydown', onKeydown)
</script>

<style lang="scss" scoped>
.tp-root {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  /* 占满阅读器整宽：全屏态面板的 inset:0 以此为定位基准 */
  left: 0;
  z-index: 9999;
  pointer-events: none;
}

/* 右缘拉手：半圆片贴屏幕右缘；面板展开后贴面板左缘（宽 190px） */
.tp-handle {
  position: absolute;
  right: 0;
  width: 22px;
  height: 56px;
  border: none;
  border-radius: 8px 0 0 8px;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  backdrop-filter: blur(10px);
  transition:
    background 0.15s,
    opacity 0.2s;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.25);

  &:hover {
    background: rgba(0, 0, 0, 0.6);
  }

  /* 收起态：右缘垂直居中 */
  &--solo {
    top: 50%;
    transform: translateY(-50%);
  }

  /* 单列态：贴面板左缘垂直居中 */
  &--attached {
    right: 285px;
    top: 50%;
    transform: translateY(-50%);
  }
}

.tp-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 285px;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.97);
  border-left: 1px solid #e5e7eb;
  border-radius: 12px 0 0 12px;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.12);
  pointer-events: auto;

  &--full {
    inset: 0;
    width: auto;
    background: #fafafa;
  }
}

.tp-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #eee;

  &__title {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: #1f2937;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    flex-shrink: 0;
    font-size: 11px;
    color: #9ca3af;
  }

  &__ops {
    flex-shrink: 0;
    display: flex;
    gap: 2px;
  }
}

.tp-body {
  flex: 1;
  min-height: 0;

  :deep(.n-spin-content) {
    height: 100%;
    overflow-y: auto;
  }
}

/* 默认单列；全屏时网格铺满 */
.tp-list {
  display: grid;
  /* 单列态两列；全屏时由 --full 覆盖为自适应网格 */
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px;

  &--full {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    padding: 16px;
  }
}

.tp-item {
  cursor: pointer;

  &__thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 4;
    border-radius: 6px;
    overflow: hidden;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    transition: border-color 0.15s, transform 0.15s;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  &:hover .tp-item__thumb {
    border-color: #18a058;
    transform: translateY(-2px);
  }

  &--current .tp-item__thumb {
    border-color: #18a058;
    box-shadow: 0 0 0 2px rgba(24, 160, 88, 0.35);
  }

  &__placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;

    &--file {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1px;
      color: #b0b6bf;
    }
  }

  &__video-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
  }

  &__index {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    color: #6b7280;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.tp-empty {
  padding: 32px 12px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}
</style>

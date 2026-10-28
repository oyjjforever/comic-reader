<template>
  <div class="image-reader">
    <!-- 左右翻页模式 -->
    <div
      v-if="!isScrollMode"
      class="image-wrapper"
      :class="{ 'manga-order': isMangaDouble }"
      :style="imageTransformStyle"
    >
      <img
        :src="`file://${file.fullPath}`"
        :alt="file.name"
        class="main-image"
        :class="{ 'pair-image': !!nextFile }"
        @dragstart.prevent
        @error="onImageError"
      />
      <!-- 双页模式：与当前页并排显示的下一页 -->
      <img
        v-if="nextFile"
        :src="`file://${nextFile.fullPath}`"
        :alt="nextFile.name"
        class="main-image pair-image"
        @dragstart.prevent
        @error="onImageError"
      />
    </div>
    <!-- 上下滚动模式：占位骨架常驻（虚拟化），仅视口附近挂载真实图片 -->
    <div v-else ref="scrollRef" class="scroll-container" @scroll="onScroll">
      <div
        v-for="(f, i) in list || []"
        :key="f.fullPath"
        class="scroll-item"
        :data-index="i"
        :style="{ height: heightFor(i) + 'px' }"
      >
        <img
          v-if="isRendered(i)"
          :src="`file://${f.fullPath}`"
          :alt="f.name"
          class="scroll-image"
          decoding="async"
          @load="onImageLoad(i, $event)"
          @dragstart.prevent
          @error="onImageError"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { FileInfo } from '@/typings/file'
import { readingMode, pageDirection } from '../reader-state'

// Props
const props = defineProps<{
  file: FileInfo
  // 双页模式下与当前页并排显示的下一页
  nextFile?: FileInfo
  // 上下滚动模式：整部作品的页列表（与 file 同源）
  list?: FileInfo[]
}>()

const emit = defineEmits<{
  (e: 'scroll-page', index: number): void
}>()

const isScrollMode = computed(() => readingMode.value === 'scroll')
// 日漫模式：双页时顺序反转（当前页在右、下一页在左）
const isMangaDouble = computed(() => pageDirection.value === 'manga' && !!props.nextFile)

const onImageError = () => {}
const imageTransformStyle = computed(() => ({
  transform: `scale(1)`,
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}))

// ===== 上下滚动模式（窗口化虚拟渲染） =====
// 全部页以固定高度占位 div 常驻（高度 = 宽高比 × 容器宽），仅视口附近（±1 屏）挂载 <img>，
// 离屏卸载以释放解码内存。漫画各页尺寸基本一致：首图加载后学得宽高比，占位高度即与真实一致，
// 跳页定位与总高度都稳定
const DEFAULT_RATIO = 1.4
const scrollRef = ref<HTMLElement | null>(null)
// 容器宽度（高度按 宽×比 计算）
const containerWidth = ref(0)
// 已学到的统一宽高比（首个加载完成的图片）
const learnedRatio = ref<number | null>(null)
// 每页真实宽高比（卸载后继续用于占位高度）
const loadedRatios = ref<Record<number, number>>({})
// 视口窗口内需要挂载 img 的索引集合（非响应式，配合 renderVersion 触发更新）
const renderSet = new Set<number>()
const renderVersion = ref(0)

let io: IntersectionObserver | null = null
let ro: ResizeObserver | null = null
const observedEls = new WeakSet<Element>()

// 最近一次同步给父级（或从父级收到）的页索引，避免 滚动上报↔外部跳转 相互触发的回环
let lastSyncedIndex = -1
let reportTimer: number | null = null
// 外部跳转定位未完成时（上方图片陆续加载导致布局变化）持续校正滚动位置
let pinning = false

const heightFor = (i: number): number => {
  const ratio = loadedRatios.value[i] ?? learnedRatio.value ?? DEFAULT_RATIO
  return Math.max(1, Math.round(ratio * Math.max(1, containerWidth.value)))
}

const isRendered = (i: number): boolean => {
  // 读取 renderVersion 建立响应依赖
  void renderVersion.value
  return renderSet.has(i)
}

const scrollItems = (): HTMLElement[] => {
  const el = scrollRef.value
  if (!el) return []
  return Array.from(el.querySelectorAll('.scroll-item'))
}

// 视口中心所在页的索引
const visibleIndex = (): number => {
  const el = scrollRef.value
  if (!el) return -1
  const mid = el.scrollTop + el.clientHeight / 2
  const items = scrollItems()
  for (let i = 0; i < items.length; i++) {
    if (mid < items[i].offsetTop + items[i].offsetHeight) return i
  }
  return items.length - 1
}

const onScroll = () => {
  if (pinning) return
  if (reportTimer) return
  reportTimer = window.setTimeout(() => {
    reportTimer = null
    const idx = visibleIndex()
    if (idx >= 0 && idx !== lastSyncedIndex) {
      lastSyncedIndex = idx
      emit('scroll-page', idx)
    }
  }, 150)
}

const onImageLoad = (i: number, ev: Event) => {
  const img = ev.target as HTMLImageElement
  if (!img.naturalWidth || !img.naturalHeight) return
  const ratio = img.naturalHeight / img.naturalWidth
  loadedRatios.value = { ...loadedRatios.value, [i]: ratio }
  if (learnedRatio.value == null) learnedRatio.value = ratio
}

const observeAll = () => {
  const el = scrollRef.value
  if (!el || !io) return
  el.querySelectorAll('.scroll-item').forEach((node) => {
    if (!observedEls.has(node)) {
      observedEls.add(node)
      io!.observe(node)
    }
  })
}

const destroyVirtualization = () => {
  io?.disconnect()
  io = null
  ro?.disconnect()
  ro = null
  renderSet.clear()
  renderVersion.value++
}

const setupVirtualization = async () => {
  await nextTick()
  const el = scrollRef.value
  if (!el) return
  destroyVirtualization()
  // 视口上下各预留 1 屏的挂载缓冲
  io = new IntersectionObserver(
    (entries) => {
      let changed = false
      for (const en of entries) {
        const i = Number((en.target as HTMLElement).dataset.index)
        if (Number.isNaN(i)) continue
        if (en.isIntersecting) {
          if (!renderSet.has(i)) {
            renderSet.add(i)
            changed = true
          }
        } else if (renderSet.has(i)) {
          renderSet.delete(i)
          changed = true
        }
      }
      if (changed) renderVersion.value++
    },
    { root: el, rootMargin: '100% 0px 100% 0px' }
  )
  ro = new ResizeObserver(() => {
    if (scrollRef.value) containerWidth.value = scrollRef.value.clientWidth
  })
  ro.observe(el)
  containerWidth.value = el.clientWidth
  observeAll()
}

const currentIndex = (): number => {
  const list = props.list || []
  const idx = list.findIndex((f) => f.fullPath === props.file?.fullPath)
  return idx >= 0 ? idx : 0
}

// 外部页码变化（进度条/页码跳转/自动播放/切回翻页模式）时滚动到对应页。
// 未加载页的占位高度为估算值，定位后在短时间内持续校正，用户主动滚动则立即停止校正
let pinToken = 0
let activePinStop: (() => void) | null = null
const scrollToIndex = (index: number) => {
  const el = scrollRef.value
  if (!el) return
  const item = scrollItems()[index]
  if (!item) return
  lastSyncedIndex = index
  // 取消上一次未完成的定位（连续跳页时只保留最后一个目标）
  if (activePinStop) activePinStop()
  const myToken = ++pinToken
  pinning = true
  const stop = () => {
    if (myToken !== pinToken) return
    pinning = false
    el.removeEventListener('wheel', stop)
    activePinStop = null
  }
  activePinStop = stop
  el.addEventListener('wheel', stop, { passive: true })
  const start = performance.now()
  let lastY = -1
  const step = () => {
    if (myToken !== pinToken || !pinning || !scrollRef.value) return
    const y = item.offsetTop
    if (y !== lastY) {
      scrollRef.value.scrollTop = y
      lastY = y
    }
    if (performance.now() - start < 1500) {
      requestAnimationFrame(step)
    } else {
      stop()
    }
  }
  requestAnimationFrame(step)
}

// 滚动模式激活时初始化虚拟化并定位到当前页
watch(
  isScrollMode,
  async (active) => {
    if (!active) {
      destroyVirtualization()
      return
    }
    await setupVirtualization()
    scrollToIndex(currentIndex())
  },
  { immediate: true }
)

// 列表数据后到（fetchData 异步）时补充观察新增占位节点
watch(
  () => props.list?.length,
  () => {
    if (isScrollMode.value && io) {
      nextTick(() => {
        observeAll()
        scrollToIndex(currentIndex())
      })
    }
  }
)

// 翻页模式下外部翻页后切回滚动模式 / 滚动模式下外部跳页，都跟随定位
watch(
  () => props.file?.fullPath,
  () => {
    if (!isScrollMode.value) return
    const idx = currentIndex()
    if (idx !== lastSyncedIndex) {
      nextTick(() => scrollToIndex(idx))
    }
  }
)

onUnmounted(() => {
  destroyVirtualization()
  if (reportTimer) {
    clearTimeout(reportTimer)
    reportTimer = null
  }
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
  .image-wrapper {
    @apply flex items-center justify-center w-full h-full;
    transform-origin: center center;
    gap: 4px;

    /* 日漫模式：双页顺序反转，当前页在右 */
    &.manga-order {
      flex-direction: row-reverse;
    }
  }

  .main-image {
    @apply w-full h-full object-contain select-none;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

  /* 双页模式：两页并排，各自最多占一半宽度 */
  .pair-image {
    width: auto;
    max-width: 50%;
  }

  /* 上下滚动模式 */
  .scroll-container {
    @apply w-full h-full overflow-y-auto;
    scrollbar-width: thin;

    .scroll-item {
      position: relative;
      overflow: hidden;

      .scroll-image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
      }
    }
  }
}
/* 全屏时的样式调整 */
:fullscreen {
  .image-reader {
    background: #000;
  }
}
</style>

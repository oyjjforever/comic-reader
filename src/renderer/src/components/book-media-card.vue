<template>
  <div class="media-card-shell">
    <!-- data-media-path：关闭阅读器的合书动画按此回查卡片。必须挂在 .media-card
         本体上——飞行舞台的铬件层级规则按它匹配，挂外壳会导致封面沉到阅读器下 -->
    <div
      class="media-card"
      ref="cardRef"
      :data-media-path="item.path || ''"
      :style="thicknessStyle"
      @click="handleCardClick"
      @mouseenter="handleTiltEnter"
      @mousemove="handle3DTilt"
      @mouseleave="reset3DTilt"
    >
      <!-- 封面区域（前封面，沿 Z 轴前推形成厚度） -->
      <div class="cover-container">
        <img
          v-if="coverImageSrc && !imageError"
          :src="coverImageSrc"
          :alt="item.title"
          class="cover-image"
          @load="onImageLoad"
          @error="onImageError"
        />
        <div v-else-if="isLoadingCover" class="placeholder-cover">
          <n-icon :component="FolderIcon" size="32" />
          <div class="placeholder-text">加载中...</div>
        </div>
        <div v-else class="placeholder-cover">
          <n-icon :component="FolderIcon" size="48" />
          <div class="placeholder-text">无封面</div>
        </div>

        <!-- 标题横幅（常显，单行省略，悬浮显示全名） -->
        <div class="comic-title-banner">
          <div class="comic-title" :title="item.title">{{ item.title }}</div>
          <div class="comic-issue">
            <span v-if="showCount && item.fileCount">共 {{ item.fileCount }} 页</span>
          </div>
        </div>
      </div>

      <!-- 评分铭牌（拉丝金属材质随评分分级，浮于封面上方） -->
      <div v-if="rating > 0" class="stamp-badge" :class="ratingMetal" :title="`评分 ${rating} 星`">
        <span>{{ rating }}★</span>
      </div>

      <!-- 左侧书脊切面（主色取自封面） -->
      <div class="comic-spine"></div>
      <!-- 右侧书页厚度切面 -->
      <div class="comic-pages"></div>
      <!-- 顶部/底部书页切面 -->
      <div class="comic-top"></div>
      <div class="comic-bottom"></div>

      <!-- 鼠标跟随高光 -->
      <div class="card-glare"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderOutline as FolderIcon } from '@vicons/ionicons5'
import type { MediaItem } from '@/typings/media'
import {
  flyCardFullscreen,
  useMediaCardCover,
  useMediaCardMeta,
  use3DTilt
} from '@renderer/composables/use-media-card'

interface Props {
  /** 统一媒体条目（唯一必填参数） */
  item: MediaItem
  /** 评分/浏览历史的命名空间，默认取 item.source */
  namespace?: string
  /** 是否显示页数（标题横幅副行） */
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
const itemRef = toRef(props, 'item')
const cardRef = ref<HTMLElement>()

const { coverImageSrc, isLoadingCover, imageError } = useMediaCardCover(itemRef, cardRef)

/** 点击打开：阅读器（Teleport）即刻挂入飞行舞台随书本一起放大（见 use-media-card）；
 * 加载中/空内容跳过动画直接打开（走提示） */
const flyOpen = (i: MediaItem) => {
  if (i.state) {
    emit('open', i)
    return
  }
  flyCardFullscreen(cardRef.value, () => emit('open', i))
}

const { rating, handleCardClick } = useMediaCardMeta(itemRef, ns, (i) => flyOpen(i))
const { handleTiltEnter, handle3DTilt, reset3DTilt } = use3DTilt(
  cardRef,
  20,
  () => bookThickness.value
)

/** 评分铭牌材质：5星金、4星银、其余铜 */
const ratingMetal = computed(() =>
  rating.value >= 5 ? 'metal-gold' : rating.value >= 4 ? 'metal-silver' : 'metal-bronze'
)

const onImageError = () => {
  imageError.value = true
}

// ===== 书脊自动取色 =====
/** 封面加载完成后提取主色，驱动书脊配色 */
const onImageLoad = (e: Event) => {
  applySpineColor(e.target as HTMLImageElement)
}

/**
 * 从封面图提取主色调：缩小到 64px canvas 采样，过滤太暗/太亮/低饱和像素，
 * 按色相分桶取数量最多的桶的均值。跨域封面读取像素会抛错，返回 null 走默认色。
 */
const extractDominantColor = (
  img: HTMLImageElement
): { r: number; g: number; b: number } | null => {
  try {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    const buckets = Array.from({ length: 360 }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (data[i + 3] < 200) continue

      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const delta = max - min
      const v = max / 255
      const s = max === 0 ? 0 : delta / max
      if (v < 0.18 || v > 0.95 || s < 0.18) continue

      let h = 0
      if (delta !== 0) {
        if (max === r) h = 60 * (((g - b) / delta) % 6)
        else if (max === g) h = 60 * ((b - r) / delta + 2)
        else h = 60 * ((r - g) / delta + 4)
      }
      if (h < 0) h += 360

      const bucket = buckets[Math.floor(h) % 360]
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.count++
    }

    let best: { r: number; g: number; b: number; count: number } | null = null
    for (const bucket of buckets) {
      if (bucket.count > 0 && (!best || bucket.count > best.count)) best = bucket
    }
    if (!best) return null
    return { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count }
  } catch {
    // 跨域封面无法读取像素，保持默认书脊色
    return null
  }
}

/** 提亮增饱和：先放大亮度，再以均值为锚提升对比，让书脊色更鲜明 */
const boostColor = (r: number, g: number, b: number, factor = 1.15) => {
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)))
  let nr = r * factor
  let ng = g * factor
  let nb = b * factor
  const avg = (nr + ng + nb) / 3
  const contrast = 1.1
  nr = (nr - avg) * contrast + avg
  ng = (ng - avg) * contrast + avg
  nb = (nb - avg) * contrast + avg
  return { r: clamp(nr), g: clamp(ng), b: clamp(nb) }
}

const applySpineColor = (img: HTMLImageElement) => {
  if (!cardRef.value) return
  const color = extractDominantColor(img)
  if (!color) return
  const boosted = boostColor(color.r, color.g, color.b)
  cardRef.value.style.setProperty('--spine-color', `rgb(${boosted.r}, ${boosted.g}, ${boosted.b})`)
}

// ===== 书本厚度：基础 20px + 每 10 页 0.5px，上限 70px（无页数信息按最薄处理） =====
const bookThickness = computed(() => {
  const pages = props.item.fileCount || 0
  return Math.min(20 + Math.floor(pages / 10) * 0.5, 70)
})

const thicknessStyle = computed(() => ({ '--book-thickness': `${bookThickness.value}px` }))
</script>

<style lang="scss" scoped>
@use './media-card-common';

/* 评分角标悬浮：浮在封面上方 5px（厚度随页数 20~70px 变化，固定值会陷进厚书） */
.stamp-badge {
  transform: translateZ(calc(var(--book-thickness) + 5px));
}

/* ===== 卡片本体（3D 书体：自身是背板，封面沿 Z 轴前推） ===== */
.media-card {
  /* 书脊主色：封面加载后由 JS 提取注入 */
  --spine-color: #2a2a4a;
  /* 书本厚度：由页数计算注入 */
  --book-thickness: 20px;

  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.2s ease-out;
  /* 初始姿态：整体后移一个厚度，让封面（前推同值）落在 z=0 平面，
     消除透视把厚书封面放大的问题，网格内各卡视觉尺寸一致 */
  transform: rotateX(0deg) rotateY(0deg) translateZ(calc(var(--book-thickness) * -1));
  cursor: pointer;
  box-shadow:
    0 30px 40px -12px rgba(35, 28, 18, 0.6),
    0 10px 15px -5px rgba(35, 28, 18, 0.42);
}

/* ===== 封面容器（前封面，沿 Z 轴前推形成书的厚度） ===== */
.cover-container {
  position: absolute;
  inset: 0;
  border-radius: 4px 10px 10px 4px;
  overflow: hidden;
  z-index: 2;
  background: #1a1a2e;
  transform: translateZ(var(--book-thickness));
  box-shadow:
    inset -2px 0 10px rgba(0, 0, 0, 0.5),
    inset 1px 0 0 rgba(255, 255, 255, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}

/* 封面印刷纹理（细横竖线交织） */
.cover-container::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  opacity: 0.3;
  mix-blend-mode: overlay;
  background-image: repeating-linear-gradient(
      to right,
      rgba(255, 255, 255, 0.05) 0px,
      rgba(255, 255, 255, 0.05) 1px,
      transparent 1px,
      transparent 3px
    ),
    repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.04) 0px,
      rgba(0, 0, 0, 0.04) 1px,
      transparent 1px,
      transparent 4px
    );
}

.cover-container .cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  position: relative;
  z-index: 2;
  filter: brightness(0.94) contrast(1.06) saturate(1.05);
  transition:
    filter 0.4s ease,
    transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1);
}

.media-card:hover .cover-container .cover-image {
  filter: brightness(1) contrast(1.1) saturate(1.08);
  transform: scale(1.015);
}

/* 封面暗角 + 上下边缘压暗 */
.cover-container::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  background: radial-gradient(
      ellipse at 28% 35%,
      transparent 30%,
      rgba(0, 0, 0, 0.18) 78%,
      rgba(0, 0, 0, 0.35) 100%
    ),
    linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.22) 0%,
      transparent 8%,
      transparent 88%,
      rgba(0, 0, 0, 0.28) 100%
    );
  mix-blend-mode: multiply;
}

/* ===== 3D 书体切面 ===== */

/* 左侧书脊切面：主色底 + 竖向金色烫线 */
.comic-spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--book-thickness);
  background: linear-gradient(to right, rgba(0, 0, 0, 0.7), var(--spine-color));
  transform-origin: left center;
  transform: rotateY(-90deg);
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.8);
}

.comic-spine::before {
  content: '';
  position: absolute;
  top: 10%;
  bottom: 10%;
  left: 50%;
  width: 1px;
  background: rgba(212, 175, 55, 0.7);
  box-shadow: 0 0 3px rgba(212, 175, 55, 0.7);
}

/* 右侧书页厚度切面：米黄纸页纹理 */
.comic-pages {
  position: absolute;
  top: 2px;
  bottom: 2px;
  right: 0;
  width: var(--book-thickness);
  background: repeating-linear-gradient(
    to right,
    #f5ecd8 0px,
    #f5ecd8 1px,
    #dcd0b8 1px,
    #dcd0b8 2px
  );
  transform-origin: right center;
  transform: rotateY(90deg);
}

/* 顶部/底部书页切面 */
.comic-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--book-thickness);
  background: repeating-linear-gradient(
    to bottom,
    #f5ecd8 0px,
    #f5ecd8 1px,
    #dcd0b8 1px,
    #dcd0b8 2px
  );
  transform-origin: top center;
  transform: rotateX(90deg);
}

.comic-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--book-thickness);
  background: repeating-linear-gradient(
    to bottom,
    #f5ecd8 0px,
    #f5ecd8 1px,
    #dcd0b8 1px,
    #dcd0b8 2px
  );
  transform-origin: bottom center;
  transform: rotateX(-90deg);
  box-shadow: 0 -5px 15px rgba(0, 0, 0, 0.5) inset;
}

/* ===== 鼠标跟随高光（浮在封面上方，随厚度抬升） ===== */
.card-glare {
  position: absolute;
  inset: 0;
  z-index: 11;
  pointer-events: none;
  background: radial-gradient(
    circle at var(--gx, 50%) var(--gy, 50%),
    rgba(255, 255, 255, 0.15) 0%,
    transparent 60%
  );
  opacity: 0;
  transition: opacity 0.2s;
  transform: translateZ(calc(var(--book-thickness) + 4px));
}

.media-card:hover .card-glare {
  opacity: 1;
}
</style>

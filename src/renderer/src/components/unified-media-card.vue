<template>
  <div class="media-card-shell">
    <div class="media-card" ref="cardRef" @click="handleCardClick">
      <!-- 封面区域 -->
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
          <div class="placeholder-text">{{ item.title }}</div>
        </div>

        <!-- 评分角标（金箔烫印） -->
        <div v-if="rating > 0" class="stamp-badge" :title="`评分 ${rating} 星`">{{ rating }}★</div>

        <!-- 标题横幅（常显，单行省略，悬浮显示全名） -->
        <div class="comic-title-banner">
          <div class="comic-title" :title="item.title">{{ item.title }}</div>
          <div v-if="showCount && item.fileCount" class="comic-issue">
            共 {{ item.fileCount }} 页
          </div>
        </div>
      </div>

      <!-- 堵头布条 -->
      <div class="headband-strip"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderOutline as FolderIcon } from '@vicons/ionicons5'
import type { MediaItem } from '@/typings/media'

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
/* 透视容器（参考稿的 perspective 在网格上，这里逐卡包装实现同效） */
.media-card-shell {
  position: relative;
  width: 100%;
  height: 100%;
  perspective: 2200px;
}

/* ===== 卡片本体 ===== */
.media-card {
  /* 书脊主色：封面加载后由 JS 提取注入 */
  --spine-color: #2a2a4a;
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: 12px 6px 6px 12px;
  transition:
    transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1),
    box-shadow 0.4s ease;
  transform-style: preserve-3d;
  transform: rotateY(0deg) rotateX(1.5deg) translateZ(0);
  cursor: pointer;
  isolation: isolate;
  box-shadow:
    0 30px 40px -18px rgba(40, 30, 20, 0.55),
    0 12px 18px -10px rgba(40, 30, 20, 0.4);
}

.media-card:hover {
  transform: rotateY(-3.5deg) rotateX(2.5deg) translateY(-4px) translateZ(14px);
  box-shadow:
    0 42px 55px -22px rgba(40, 30, 20, 0.65),
    0 18px 25px -14px rgba(40, 30, 20, 0.45);
}

/* 书页侧面 */
.media-card::after {
  content: '';
  position: absolute;
  top: 4px;
  right: -1px;
  width: calc(100% - 18px);
  height: calc(100% - 8px);
  border-radius: 0 4px 4px 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0.5) 0px,
      transparent 2px,
      transparent 10px,
      rgba(0, 0, 0, 0.06) 14px,
      rgba(0, 0, 0, 0.12) 100%
    ),
    repeating-linear-gradient(
      to bottom,
      #f7f1e3 0px,
      #f7f1e3 1px,
      #e9dfcb 1px,
      #e9dfcb 2px,
      #f2ebdc 2px,
      #f2ebdc 3px,
      #e3d7c0 3px,
      #e3d7c0 4px
    );
  box-shadow:
    inset 2px 0 3px rgba(0, 0, 0, 0.15),
    inset -1px 0 2px rgba(255, 255, 255, 0.4),
    1px 0 1px rgba(0, 0, 0, 0.08);
}

/* 书脊：主色底 + 横向明暗塑形 + ribbing 纹理 + 顶部金色堵头纹 */
.media-card::before {
  content: '';
  position: absolute;
  left: -2px;
  top: -2px;
  width: 20px;
  height: calc(100% + 4px);
  border-radius: 14px 2px 2px 14px;
  z-index: 5;
  pointer-events: none;
  border-right: 1px solid rgba(0, 0, 0, 0.35);
  background: linear-gradient(
      to bottom,
      transparent 0,
      transparent 28px,
      rgba(201, 169, 107, 0.85) 28px,
      rgba(201, 169, 107, 0.85) 30px,
      transparent 30px,
      transparent 34px,
      rgba(201, 169, 107, 0.85) 34px,
      rgba(201, 169, 107, 0.85) 36px,
      transparent 36px,
      transparent 64px,
      rgba(201, 169, 107, 0.85) 64px,
      rgba(201, 169, 107, 0.85) 66px,
      transparent 66px,
      transparent 100%
    ),
    linear-gradient(
      to right,
      rgba(0, 0, 0, 0.55) 0%,
      rgba(0, 0, 0, 0.18) 18%,
      rgba(255, 255, 255, 0.18) 38%,
      rgba(255, 255, 255, 0.06) 52%,
      rgba(0, 0, 0, 0.25) 78%,
      rgba(0, 0, 0, 0.6) 100%
    ),
    repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.03) 0px,
      rgba(255, 255, 255, 0.03) 1px,
      rgba(0, 0, 0, 0.04) 1px,
      rgba(0, 0, 0, 0.04) 3px
    ),
    linear-gradient(
      to right,
      color-mix(in srgb, var(--spine-color) 55%, #000) 0%,
      var(--spine-color) 30%,
      color-mix(in srgb, var(--spine-color) 88%, #fff) 45%,
      var(--spine-color) 62%,
      color-mix(in srgb, var(--spine-color) 60%, #000) 100%
    );
  box-shadow:
    inset -5px 0 9px rgba(0, 0, 0, 0.65),
    inset 3px 0 6px rgba(255, 255, 255, 0.12),
    inset 0 10px 16px -6px rgba(0, 0, 0, 0.35),
    inset 0 -10px 16px -6px rgba(0, 0, 0, 0.35),
    2px 0 6px rgba(0, 0, 0, 0.35);
}

/* ===== 封面容器 ===== */
.cover-container {
  position: absolute;
  top: 0;
  left: 16px;
  right: 0;
  bottom: 0;
  border-radius: 0 6px 6px 0;
  overflow: hidden;
  z-index: 2;
  background: #1a1a2e;
  box-shadow:
    inset 1px 0 0 rgba(255, 255, 255, 0.08),
    inset -2px 0 8px rgba(0, 0, 0, 0.25),
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

/* 加载/无封面占位（纯色底 + 图标文案） */
.placeholder-cover {
  width: 100%;
  height: 100%;
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8a8aa0;
  gap: 10px;
  text-align: center;
  padding: 16px;
}

.placeholder-text {
  font-size: 12px;
  color: #a0a0b8;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ===== 堵头布条 ===== */
.headband-strip {
  position: absolute;
  top: 0;
  left: 10px;
  width: 11px;
  height: 42px;
  z-index: 8;
  background: repeating-linear-gradient(to bottom, #c9a96b 0 2px, #a07840 2px 4px);
  border-radius: 0 0 4px 4px;
  box-shadow:
    2px 1px 3px rgba(0, 0, 0, 0.35),
    inset 1px 0 0 rgba(255, 255, 255, 0.3);
  transform: rotate(-2deg);
  transform-origin: top center;
  transition: transform 0.3s ease;
  pointer-events: none;
}

.media-card:hover .headband-strip {
  transform: rotate(-0.5deg);
}
.stamp-badge {
  position: absolute;
  top: 8px;
  right: 6px;
  z-index: 9;
  padding: 0.36rem 0.62rem 0.38rem;
  border-radius: 3px;
  transform: rotate(4deg);

  /* 字体 */
  font-family: 'Bangers', 'Impact', 'Arial Black', sans-serif;
  // font-size: 1rem;
  // font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  line-height: 1;

  /* 文字：纯白，最大对比 */
  color: #ffffff;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.9),
    0 0 1px rgba(0, 0, 0, 0.9);

  /* 底板：实心深棕黑 */
  background-color: rgba(10, 8, 5, 0.45);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);

  /* 烫金边框 + 压印 + 外光晕 */
  border: 1.5px solid #d4af37;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 235, 170, 0.15),
    0 1px 3px rgba(0, 0, 0, 0.55),
    0 0 7px rgba(212, 175, 55, 0.35);
}

/* 极淡的金属反光（不干扰文字） */
.stamp-badge::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 2px;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent 0%,
    transparent 44%,
    rgba(255, 255, 255, 0.06) 49%,
    transparent 54%,
    transparent 100%
  );
}

/* ===== 标题横幅 ===== */
.comic-title-banner {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1.2rem 0.9rem 0.8rem;
  z-index: 6;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.65) 55%,
    transparent 100%
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.comic-title {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.1;
  text-transform: uppercase;
  margin: 0;
  color: #f4e9d0;
  transform: rotate(-0.8deg);
  transform-origin: left bottom;
  font-family: 'Bangers', 'Impact', 'Arial Black', sans-serif;
  letter-spacing: 1px;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.9),
    0 2px 3px rgba(0, 0, 0, 0.7),
    0 0 12px rgba(201, 169, 107, 0.35);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.comic-issue {
  font-size: 0.72rem;
  color: #cdbb96;
  letter-spacing: 1px;
  border-top: 1px solid rgba(201, 169, 107, 0.45);
  display: inline-block;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>

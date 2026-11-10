<template>
  <div class="media-card-shell">
    <!-- data-media-path：关闭阅读器的合书动画按此回查卡片。必须挂在 .media-card
         本体上——飞行舞台的铬件层级规则按它匹配，挂外壳会导致封面沉到阅读器下 -->
    <div
      class="media-card"
      ref="cardRef"
      :data-media-path="item.path || ''"
      :style="coverVarStyle"
      @click="handleCardClick"
      @mouseenter="handleTiltEnter"
      @mousemove="handle3DTilt"
      @mouseleave="reset3DTilt"
    >
      <!-- 盒底：深色薄板 -->
      <div class="case-back"></div>

      <!-- 银光盘片：夹在盒底与面板之间，银光持续旋转 -->
      <div class="cd-disc">
        <!-- 外圈光弧：贴盘缘的亮弧带，与银光同相位同速旋转（子元素随
             cloneNode 进飞行层，伪元素已用完故落成真实节点） -->
        <div class="disc-ring-light"></div>
      </div>

      <!-- 正面：透明厚壳，封面画内嵌 -->
      <div class="cover-container">
        <div v-if="coverImageSrc && !imageError" class="cover-art"></div>
        <div v-else class="placeholder-cover">
          <n-icon :component="FolderIcon" :size="isLoadingCover ? 32 : 48" />
          <div class="placeholder-text">{{ isLoadingCover ? '加载中...' : '无封面' }}</div>
        </div>

        <!-- 标题横幅（常显，单行省略，悬浮显示全名） -->
        <div class="comic-title-banner">
          <div class="comic-title" :title="item.title">{{ item.title }}</div>
          <div class="comic-issue">
            <span v-if="isSingleVideo && videoMetaLabel">{{ videoMetaLabel }}</span>
            <span v-else-if="showCount && item.fileCount">共 {{ item.fileCount }} 部</span>
          </div>
        </div>
      </div>

      <!-- 评分铭牌（拉丝金属材质随评分分级，浮于封面上方） -->
      <div v-if="rating > 0" class="stamp-badge" :class="ratingMetal" :title="`评分 ${rating} 星`">
        <span>{{ rating }}★</span>
      </div>

      <!-- 塑料盒侧棱四切面：连接背板与面板，撑出盒厚 -->
      <div class="cd-spine"></div>
      <div class="cd-side"></div>
      <div class="cd-top"></div>
      <div class="cd-bottom"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderOutline as FolderIcon } from '@vicons/ionicons5'
import type { MediaItem } from '@/typings/media'
import {
  flyDiscOpen,
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

/** 单视频文件（kind=video 即本地单个视频文件；视频文件夹 kind=comic 不在此列） */
const isSingleVideo = computed(() => props.item.kind === 'video')

/** 秒数格式化为 H:MM:SS（满 1 小时）或 M:SS */
function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** 单视频文件的封面副标题：1080p · 1:32:06（元数据加载完成前为空，不占位） */
const videoMeta = ref<{ duration: number | null; width: number | null; height: number | null } | null>(
  null
)
const videoMetaLabel = computed(() => {
  const meta = videoMeta.value
  if (!meta) return null
  const parts: string[] = []
  if (meta.height) parts.push(`${meta.height}p`)
  if (meta.duration != null && meta.duration > 0) parts.push(formatDuration(meta.duration))
  return parts.length ? parts.join(' · ') : null
})

onMounted(() => {
  if (!isSingleVideo.value) return
  const videoPath = props.item.videoPath || props.item.path
  if (!videoPath) return
  window.media
    .getVideoMetadata(videoPath)
    .then((meta) => {
      videoMeta.value = meta
    })
    .catch(() => {
      videoMeta.value = null
    })
})

/** 点击打开：封面翻开 → 盘片卡扣弹出 → 黑洞吞噬切入阅读器（见 use-media-card）；
 * 加载中/空内容跳过动画直接打开（走提示） */
const flyOpen = (i: MediaItem) => {
  if (i.state) {
    emit('open', i)
    return
  }
  flyDiscOpen(cardRef.value, () => emit('open', i))
}

const { rating, handleCardClick } = useMediaCardMeta(itemRef, ns, (i) => flyOpen(i))
const { handleTiltEnter, handle3DTilt, reset3DTilt } = use3DTilt(cardRef, 15, () => 30)

/** 评分铭牌材质：5星金、4星银、其余铜 */
const ratingMetal = computed(() =>
  rating.value >= 5 ? 'metal-gold' : rating.value >= 4 ? 'metal-silver' : 'metal-bronze'
)

/**
 * 封面单份引用：URL 只在 DOM 中出现一次（--cover-image），
 * 封面画以它为背景渲染，不重复渲染 <img>
 */
const coverVarStyle = computed(() =>
  coverImageSrc.value && !imageError.value
    ? { '--cover-image': `url("${coverImageSrc.value}")` }
    : undefined
)
</script>

<style lang="scss" scoped>
@use './media-card-common';

/* 落地阴影：悬浮时投影下沉变淡，呈现"抬起"感 */
.media-card-shell::after {
  content: '';
  position: absolute;
  inset: 10%;
  z-index: 0;
  background: rgba(0, 0, 0, 0.8);
  filter: blur(20px);
  transform: translateY(30px);
  opacity: 0.8;
  transition:
    opacity 0.3s,
    transform 0.3s;
  pointer-events: none;
}

.media-card-shell:hover::after {
  opacity: 0.4;
  transform: translateY(40px) scale(1.05);
}

/* 评分角标悬浮：浮在封面上方 5px；打开时随铭牌一起淡出 */
.stamp-badge {
  transform: translateZ(calc(var(--box-thickness) + 5px));
  transition: opacity 0.3s ease;
}

/* ===== 盒体：薄壳（盒底 - 银盘 - 透明面板 三层 + 侧棱撑厚） ===== */
.media-card {
  --box-thickness: 30px;

  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.1s ease-out;
  /* 初始姿态：整体后移一个厚度，让封面（前推同值）落在 z=0 平面，
     与书本卡的视觉尺寸基准一致 */
  transform: rotateX(0deg) rotateY(0deg) translateZ(calc(var(--box-thickness) * -1));
  cursor: pointer;
  z-index: 2;
}

/* 盒底：深色薄板 + 内嵌暗纹边框 */
.case-back {
  position: absolute;
  inset: 0;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #333;
  box-shadow:
    inset 0 0 20px rgba(0, 0, 0, 0.8),
    0 30px 50px -10px rgba(0, 0, 0, 0.9);
  transition: opacity 0.5s ease;

  &::after {
    content: '';
    position: absolute;
    inset: 15px;
    background: linear-gradient(135deg, #222, #0a0a0a);
    border-radius: 2px;
    border: 1px solid #444;
  }
}

/* ===== 银光盘片：银面 + 中心轴孔 + 银光旋转 ===== */
.cd-disc {
  position: absolute;
  /* inset + margin auto + aspect-ratio：取能放进卡片的最大正方形并居中，
     任意长宽比的卡片都不越界（正方形卡片即示例的 320/340 比例） */
  inset: 6%;
  margin: auto;
  aspect-ratio: 1 / 1;
  transform: translateZ(calc(var(--box-thickness) / 2));
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, #ffffff 0%, #e0e0e0 60%, #b0b0b0 100%);
  box-shadow:
    inset 0 2px 5px rgba(255, 255, 255, 0.8),
    0 5px 15px rgba(0, 0, 0, 0.5);
  z-index: 5;
}

/* 中心轴孔 */
.cd-disc::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6.5%;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  background: #000;
  border-radius: 50%;
  box-shadow:
    inset 0 2px 4px rgba(0, 0, 0, 1),
    0 0 0 2px #e0e0e0,
    0 0 0 3px #bbbbbb;
  z-index: 2;
}

/* 银光旋转：高透锥形高光 + 低透彩虹衍射双层一起转动（真实光盘的虹彩感） */
.cd-disc::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    conic-gradient(
      from 120deg,
      rgba(255, 0, 128, 0.16),
      rgba(255, 200, 0, 0.16),
      rgba(0, 255, 170, 0.16),
      rgba(80, 150, 255, 0.16),
      rgba(200, 60, 255, 0.16),
      rgba(255, 0, 128, 0.16)
    ),
    conic-gradient(
      from 0deg,
      transparent 0%,
      rgba(255, 255, 255, 0.4) 12%,
      rgba(255, 255, 255, 1) 25%,
      rgba(255, 255, 255, 0.4) 38%,
      transparent 50%,
      rgba(255, 255, 255, 0.4) 62%,
      rgba(255, 255, 255, 0.95) 75%,
      rgba(255, 255, 255, 0.4) 88%,
      transparent 100%
    );
  animation: cd-disc-spin var(--disc-spin-dur, 4s) linear infinite;
  z-index: 1;
  pointer-events: none;
}

/* 外圈光弧：径向 mask 裁出盘缘环带，亮弧与内侧银光同角度布点（25%/75%
   波峰）、同一动画同一变量 → 相位恒同步，光扫到哪弧跟到哪；前后缘
   带冷暖色散模拟折射 */
.disc-ring-light {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  z-index: 3;
  /* closest-side：正方形下渐变半径 = 半盘宽，百分比即占盘缘半径的比例。
     默认 farthest-corner 会按对角线计（≈1.41 倍半径），72% 落到盘外，
     整层被 mask 裁空 */
  -webkit-mask: radial-gradient(circle closest-side, transparent 70%, #000 80%);
  mask: radial-gradient(circle closest-side, transparent 70%, #000 80%);
  background: conic-gradient(
    from 0deg,
    transparent 0%,
    rgba(140, 210, 255, 0.45) 16%,
    rgba(255, 255, 255, 1) 25%,
    rgba(255, 214, 150, 0.5) 34%,
    transparent 42%,
    transparent 50%,
    rgba(140, 210, 255, 0.45) 66%,
    rgba(255, 255, 255, 1) 75%,
    rgba(255, 214, 150, 0.5) 84%,
    transparent 92%,
    transparent 100%
  );
  animation: cd-disc-spin var(--disc-spin-dur, 4s) linear infinite;
  pointer-events: none;
}

@keyframes cd-disc-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* ===== 正面透明厚壳：封面画内嵌 10px ===== */
.cover-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 4px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: inset 2px 2px 10px rgba(255, 255, 255, 0.2);
  transform-origin: left center;
  /* perspective() 自带透视：翻开/合上都有 3D 深度，不依赖祖先透视链生效。
     scale(0.976) = 1200/(1200+30)：抵消 translateZ(30px) 在 1200px 透视下的
     放大，面板不悬出盒体轮廓（否则封面看着比盒子大一圈） */
  transform: perspective(1200px) scale(0.976) rotateY(0deg) translateZ(var(--box-thickness));
  transition: transform 0.6s cubic-bezier(0.2, 0.9, 0.3, 1);
  z-index: 10;
}

.cover-art {
  position: absolute;
  inset: 10px;
  background: var(--cover-image) center / cover no-repeat;
  border-radius: 2px;
  opacity: 0.9;
}

/* ===== 塑料盒侧棱四切面：从背板平面立起、贴到面板边缘，撑出盒厚 ===== */
.cd-spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--box-thickness);
  background: linear-gradient(to right, #0d0d0d, #2e2e2e);
  transform-origin: left center;
  transform: rotateY(-90deg);
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.9);
}

.cd-side {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: var(--box-thickness);
  background: linear-gradient(to left, #0d0d0d, #262626);
  transform-origin: right center;
  transform: rotateY(90deg);
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.9);
}

.cd-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--box-thickness);
  background: linear-gradient(to bottom, #232323, #101010);
  transform-origin: top center;
  transform: rotateX(90deg);
}

.cd-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--box-thickness);
  background: linear-gradient(to top, #232323, #101010);
  transform-origin: bottom center;
  transform: rotateX(-90deg);
  box-shadow: inset 0 -2px 5px rgba(255, 255, 255, 0.06);
}

/* 标题横幅随封面翻开淡出（样式本体在共用 scss） */
.comic-title-banner {
  transition: opacity 0.3s ease;
}

/* ===== 打开态（disc-opening 由 use-media-card 的 flyDiscOpen 添加）：
   封面绕左缘翻开 120°、铭牌横幅淡出，露出银盘；盒底保留——
   盒子立在原地直到黑洞吞过去，不提前消失 ===== */
.media-card.disc-opening {
  .cover-container {
    transform: perspective(1200px) scale(0.976) rotateY(-120deg)
      translateZ(var(--box-thickness));
  }

  .stamp-badge,
  .comic-title-banner {
    opacity: 0;
  }
}
</style>

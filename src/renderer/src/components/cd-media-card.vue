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
      <!-- 正面：带有圆形凹槽的厚壳 -->
      <div class="cover-container">
        <div v-if="!coverImageSrc || imageError" class="placeholder-cover">
          <n-icon :component="FolderIcon" :size="isLoadingCover ? 32 : 48" />
          <div class="placeholder-text">{{ isLoadingCover ? '加载中...' : '无封面' }}</div>
        </div>

        <!-- 中心隔断光盘：透明凹槽，透出下方同一张封面 -->
        <div v-if="coverImageSrc && !imageError" class="disc-indent">
          <div class="disc-center-hole"></div>
        </div>

        <!-- 标题横幅（常显，单行省略，悬浮显示全名） -->
        <div class="comic-title-banner">
          <div class="comic-title" :title="item.title">{{ item.title }}</div>
          <div class="comic-issue">
            <span v-if="showCount && item.fileCount">共 {{ item.fileCount }} 部</span>
          </div>
        </div>
      </div>

      <!-- 评分铭牌（拉丝金属材质随评分分级，浮于封面上方） -->
      <div v-if="rating > 0" class="stamp-badge" :class="ratingMetal" :title="`评分 ${rating} 星`">
        <span>{{ rating }}★</span>
      </div>

      <!-- 塑料盒骨架四切面 -->
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

/** 点击打开：阅读器（Teleport）即刻挂入飞行舞台随光盘盒一起放大（见 use-media-card）；
 * 加载中/空内容跳过动画直接打开（走提示） */
const flyOpen = (i: MediaItem) => {
  if (i.state) {
    emit('open', i)
    return
  }
  flyCardFullscreen(cardRef.value, () => emit('open', i))
}

const { rating, handleCardClick } = useMediaCardMeta(itemRef, ns, (i) => flyOpen(i))
const { handleTiltEnter, handle3DTilt, reset3DTilt } = use3DTilt(cardRef, 15, () => 20)

/** 评分铭牌材质：5星金、4星银、其余铜 */
const ratingMetal = computed(() =>
  rating.value >= 5 ? 'metal-gold' : rating.value >= 4 ? 'metal-silver' : 'metal-bronze'
)

/**
 * 封面单份引用：URL 只在 DOM 中出现一次（--cover-image），
 * 正面以它为背景渲染，不重复渲染 <img>
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

/* 评分角标悬浮：浮在封面上方 5px */
.stamp-badge {
  transform: translateZ(calc(var(--box-thickness) + 5px));
}

/* ===== 盒体：更快的跟随响应，阴影交给落地投影与正面厚壳 ===== */
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

/* ===== 正面厚壳 ===== */
.cover-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 2;
  background: #222;
  transform: translateZ(var(--box-thickness));
  /* 机加工多层阴影：内侧白描边环 + 内凹暗影 + 外投影 */
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.2),
    inset 0 0 20px rgba(0, 0, 0, 0.8),
    0 10px 20px rgba(0, 0, 0, 0.5);
}

/* 全幅封面：压暗衬托光盘 */
.cover-container::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--cover-image) center / cover no-repeat;
  // filter: brightness(0.7) contrast(1.1);
}

/* ===== 中心隔断光盘：透明凹槽直接透出封面（图片只渲染一次），内部提亮 + 物理缝隙与反光 ===== */
.disc-indent {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  /* 卡片非正方形时保持正圆 */
  width: 65%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  overflow: hidden;
  z-index: 5;
  /* 抵消封面的整体压暗，让盘面比封面亮 */
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.18) 0%,
    rgba(255, 255, 255, 0.08) 55%,
    rgba(255, 255, 255, 0) 78%
  );
  box-shadow:
    inset 0 0 0 4px rgba(0, 0, 0, 0.6),
    inset 0 0 18px rgba(0, 0, 0, 0.6),
    0 0 0 2px rgba(255, 255, 255, 0.15),
    0 15px 25px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

/* 光盘锥形反光 */
.disc-indent::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 45deg,
    transparent 0%,
    rgba(255, 255, 255, 0.1) 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.1) 75%,
    transparent 100%
  );
  mix-blend-mode: overlay;
  pointer-events: none;
}

/* 中心轴孔 */
.disc-center-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20%;
  height: 20%;
  border-radius: 50%;
  background: #000;
  box-shadow:
    inset 0 4px 8px rgba(0, 0, 0, 1),
    0 2px 2px rgba(255, 255, 255, 0.2);
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
}

.disc-center-hole::before {
  content: '';
  width: 60%;
  height: 60%;
  border-radius: 50%;
  border: 2px solid #333;
  box-shadow: inset 0 0 5px #000;
}

/* ===== 塑料盒骨架四切面（直角盒体，与正面一致） ===== */
.cd-spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--box-thickness);
  background: linear-gradient(to right, #111, #444);
  transform-origin: left center;
  transform: rotateY(-90deg);
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.9);
}

.cd-side {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: var(--box-thickness);
  background: #0a0a0a;
  transform-origin: right center;
  transform: rotateY(90deg);
}

.cd-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--box-thickness);
  background: #222;
  transform-origin: top center;
  transform: rotateX(90deg);
}

.cd-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--box-thickness);
  background: #111;
  transform-origin: bottom center;
  transform: rotateX(-90deg);
  box-shadow: inset 0 -2px 5px rgba(255, 255, 255, 0.1);
}
</style>

<template>
  <div class="highlights-view">
    <!-- 主区：影院黑底播放器 -->
    <section class="cinema-stage">
      <video
        v-if="current"
        ref="videoRef"
        class="stage-video"
        controls
        autoplay
        :src="`file://${current.video_path}`"
        @loadedmetadata="onLoadedMetadata"
      />
      <div v-else class="stage-empty">
        <n-empty description="点击下方胶片选择精彩片段开始播放" />
      </div>

      <!-- 同视频片段标记轨：按时间点打点（原生 controls 无法注入标记，独立细轨代之） -->
      <div v-if="current && chapterMarks.length > 1" class="chapter-rail">
        <span class="rail-time">{{ formatTs(videoDuration) }}</span>
        <div class="rail-track">
          <button
            v-for="m in chapterMarks"
            :key="m.item.id"
            class="rail-mark"
            :class="{ active: m.item.id === current?.id }"
            :style="{ left: m.pct + '%' }"
            :title="`${formatTs(m.item.time_point)}${m.item.title ? ' ' + m.item.title : ''}`"
            @click="playHighlight(m.item)"
          />
        </div>
      </div>

    </section>

    <!-- 底部胶片带：放大缩略图 + 时间戳角标，两端箭头上/下一个片段（选中项自动居中） -->
    <footer class="filmstrip">
      <button class="strip-nav" :disabled="!hasPrev" title="上一个片段" @click="step(-1)">
        <n-icon :component="ChevronBack" :size="18" />
      </button>

      <div ref="stripRef" class="strip-scroll" @wheel="onStripWheel">
        <div v-if="filteredHighlights.length === 0" class="strip-empty">
          {{ loading ? '加载中...' : '暂无精彩片段' }}
        </div>
        <div
          v-for="item in filteredHighlights"
          :key="item.id"
          :data-id="item.id"
          class="strip-cell"
          :class="{ active: current?.id === item.id }"
          @click="playHighlight(item)"
        >
          <div class="cell-thumb">
            <img
              v-if="thumbOf(item)"
              :src="thumbOf(item)"
              :alt="getVideoName(item.video_path)"
              @error="onThumbError(item.id)"
            />
            <div v-else class="cell-placeholder">
              <n-icon :component="VideoIcon" :size="22" />
            </div>
            <span class="cell-stamp">{{ formatTs(item.time_point) }}</span>
            <!-- 删除：缩略图右上角，悬浮显示 -->
            <n-button
              class="cell-del"
              quaternary
              circle
              size="tiny"
              :focusable="false"
              title="删除片段"
              @click.stop="confirmDelete(item)"
            >
              <template #icon>
                <n-icon :component="TrashIcon" />
              </template>
            </n-button>
          </div>
          <div class="cell-title" :title="item.title || getVideoName(item.video_path)">
            {{ item.title || getVideoName(item.video_path) }}
          </div>
        </div>
      </div>

      <button class="strip-nav" :disabled="!hasNext" title="下一个片段" @click="step(1)">
        <n-icon :component="ChevronForward" :size="18" />
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import {
  PlayCircle as VideoIcon,
  Trash as TrashIcon,
  ChevronBack,
  ChevronForward
} from '@vicons/ionicons5'
import type { VideoBookmark } from '@/typings/video-bookmarks'

const props = defineProps<{
  searchKeyword?: string
}>()

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const highlights = ref<VideoBookmark[]>([])
const thumbs = ref<Record<number, string>>({})
const current = ref<VideoBookmark | null>(null)
const videoRef = ref<HTMLVideoElement>()
const stripRef = ref<HTMLElement>()
const videoDuration = ref(0)

const filteredHighlights = computed(() => {
  const kw = (props.searchKeyword || '').trim().toLowerCase()
  if (!kw) return highlights.value
  return highlights.value.filter((item) => {
    const name = getVideoName(item.video_path).toLowerCase()
    const title = (item.title || '').toLowerCase()
    return name.includes(kw) || title.includes(kw)
  })
})

// 当前片段在胶片带中的位置（驱动两端箭头的可用性）
const idxOfCurrent = computed(() =>
  filteredHighlights.value.findIndex((i) => i.id === current.value?.id)
)
const hasPrev = computed(() => idxOfCurrent.value > 0)
const hasNext = computed(
  () => idxOfCurrent.value >= 0 && idxOfCurrent.value < filteredHighlights.value.length - 1
)

// 同视频片段 → 时间轴打点（原生进度条注入不了标记，独立细轨呈现）
const chapterMarks = computed(() => {
  if (!current.value || !videoDuration.value) return []
  return filteredHighlights.value
    .filter((i) => i.video_path === current.value!.video_path)
    .map((item) => ({
      item,
      pct: Math.min(100, Math.max(0, (item.time_point / videoDuration.value) * 100))
    }))
})

const getVideoName = (path: string) => path.split(/[/\\]/).pop() || path

/** 秒 → m:ss / h:mm:ss（角标/打点统一格式） */
const formatTs = (sec?: number) => {
  const s = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const thumbOf = (item: VideoBookmark) => (item.id != null ? thumbs.value[item.id] : '')

const onThumbError = (id?: number) => {
  if (id != null) thumbs.value[id] = ''
}

// 卸载标记：截帧循环在组件卸载后停止推进（在途的单组由超时自行收尾）
let disposed = false

// 从同一视频的多个时间点逐帧抓取缩略图（复用单个 video 元素）
const captureGroup = (videoPath: string, bookmarks: VideoBookmark[]) =>
  new Promise<void>((resolve) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.src = `file://${videoPath}`

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }

    // 单组 15s 兜底：坏文件 file:// 元数据既不加载也不报错时事件永不触发，
    // Promise 与 video 元素会被闭包永久持有（与 thumbnail-panel 同值）
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      resolve()
    }
    const timer = window.setTimeout(finish, 15000)

    let index = 0
    const captureNext = () => {
      if (index >= bookmarks.length) {
        finish()
        return
      }
      const bm = bookmarks[index]
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        try {
          const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 0.5625
          const w = Math.min(200, video.videoWidth || 200)
          const h = Math.round(w * ratio)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(video, 0, 0, w, h)
          if (bm.id != null) thumbs.value[bm.id] = canvas.toDataURL('image/jpeg', 0.8)
        } catch {
          // ignore capture failure
        }
        index++
        captureNext()
      }
      video.addEventListener('seeked', onSeeked)
      const target =
        bm.time_point > 0 && isFinite(video.duration) && bm.time_point < video.duration
          ? bm.time_point
          : 0
      video.currentTime = target
    }

    video.addEventListener('loadedmetadata', captureNext)
    video.addEventListener('error', finish)
  })

// 按视频分组，逐个视频抓取其下所有时间点的帧
const captureThumbs = async () => {
  const groups = new Map<string, VideoBookmark[]>()
  for (const item of highlights.value) {
    if (!groups.has(item.video_path)) groups.set(item.video_path, [])
    groups.get(item.video_path)!.push(item)
  }
  for (const [videoPath, group] of groups) {
    if (disposed) return
    try {
      await captureGroup(videoPath, group)
    } catch {
      // ignore group failure
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const reload = async () => {
  loading.value = true
  try {
    const list = await window.videoBookmarks.getAllVideoBookmarks('created_at DESC')
    highlights.value = list
    thumbs.value = {}
    captureThumbs()

    // 默认不自动播放，等用户点胶片（保持上次浏览位置由外部记忆时再恢复）
    if (current.value && !list.some((i) => i.id === current.value?.id)) {
      current.value = null
    }
  } catch (error: any) {
    message.error(`加载精彩片段失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

const seekToCurrent = () => {
  const el = videoRef.value
  if (el && current.value) {
    el.currentTime = current.value.time_point
    el.play().catch(() => {})
  }
}

const playHighlight = (item: VideoBookmark) => {
  if (current.value && current.value.video_path === item.video_path) {
    // 同一视频，仅跳转时间点
    current.value = item
    nextTick(seekToCurrent)
  } else {
    // 切换视频，src 变化后会通过 loadedmetadata 自动跳转
    current.value = item
  }
}

const step = (dir: 1 | -1) => {
  const target = filteredHighlights.value[idxOfCurrent.value + dir]
  if (target) playHighlight(target)
}

// 竖直滚轮 → 胶片带横向滚动（'instant' 强制立即：'auto' 会跟随 CSS 的 smooth，
// 每个滚轮增量都启动一次平滑动画且互相打断，表现为滚动发卡）
const onStripWheel = (e: WheelEvent) => {
  const el = stripRef.value
  if (!el) return
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!delta) return
  e.preventDefault()
  el.scrollTo({ left: el.scrollLeft + delta, behavior: 'instant' })
}

const onLoadedMetadata = () => {
  videoDuration.value = videoRef.value?.duration || 0
  seekToCurrent()
}

// 选中项变化 → 胶片带平滑居中（仅在用户主动切换时触发，不存在下载队列那种抢滚动问题）
watch(
  () => current.value?.id,
  (id) => {
    if (id == null) return
    void nextTick(() => {
      stripRef.value
        ?.querySelector(`[data-id="${CSS.escape(String(id))}"]`)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    })
  }
)

onBeforeUnmount(() => {
  disposed = true
  // 播放器防幽灵音轨：脱离 DOM 仍在播的媒体会继续出声并驻留解码缓冲
  const el = videoRef.value
  if (el) {
    try {
      if (!el.paused) el.pause()
      el.removeAttribute('src')
      el.load()
    } catch {
      /* ignore */
    }
  }
})

// 删除精彩片段（带二次确认）
const confirmDelete = (item: VideoBookmark) => {
  dialog.warning({
    title: '删除精彩片段',
    content: '确定要删除该精彩片段吗？此操作不可撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => deleteHighlight(item)
  })
}

const deleteHighlight = async (item: VideoBookmark) => {
  if (item.id == null) return
  try {
    await window.videoBookmarks.deleteVideoBookmark(item.id)
    highlights.value = highlights.value.filter((h) => h.id !== item.id)
    delete thumbs.value[item.id]
    // 删除的若是当前播放项，优先落到邻位片段（先向后，再向前）
    if (current.value?.id === item.id) {
      const idx = filteredHighlights.value.findIndex((h) => h.id === item.id)
      current.value =
        filteredHighlights.value[idx] || filteredHighlights.value[idx - 1] || null
    }
    message.success('已删除')
  } catch (error: any) {
    message.error(`删除失败: ${error.message}`)
  }
}

onMounted(() => {
  reload()
})

defineExpose({ reload })
</script>

<style lang="scss" scoped>
// 影院胶片式：黑底大画幅播放器 + 底部横向胶片带
// 配色沿用全站暖橙（#ff9205 系）压暗底（#0e0c12 系），与 reader 黑底同族
.highlights-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  // 四周圆角：与侧栏/抽屉的玻璃面板同语言（main-content 自带 8px 内边距，圆角可见）
  border-radius: 16px;
  background: #0e0c12;
}

.cinema-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #000;

  .stage-video {
    flex: 1;
    min-height: 0;
    width: 100%;
    background: #000;
  }

  .stage-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #16131c;

    :deep(.n-empty__description) {
      color: #8b8394;
    }
  }

  // ===== 同视频片段标记轨 =====
  .chapter-rail {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px 0;
    background: #000;

    .rail-time {
      flex-shrink: 0;
      font-size: 10px;
      color: #6f6878;
      font-variant-numeric: tabular-nums;
    }

    .rail-track {
      position: relative;
      flex: 1;
      height: 16px;

      // 细轴线
      &::before {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 2px;
        transform: translateY(-50%);
        background: rgba(255, 255, 255, 0.12);
        border-radius: 1px;
      }
    }

    .rail-mark {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 8px;
      height: 8px;
      padding: 0;
      border-radius: 50%;
      background: #4a4452;
      border: 1.5px solid #0e0c12;
      cursor: pointer;
      transition:
        background 0.15s,
        transform 0.15s,
        box-shadow 0.15s;

      &:hover {
        background: #ffb04d;
      }

      &.active {
        background: #ff9205;
        transform: translate(-50%, -50%) scale(1.35);
        box-shadow: 0 0 0 3px rgba(255, 146, 5, 0.25);
      }
    }
  }

}

// ===== 底部胶片带 =====
.filmstrip {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 10px 12px 12px;
  background: #14111a;
  border-top: 1px solid rgba(255, 255, 255, 0.06);

  .strip-nav {
    flex-shrink: 0;
    width: 26px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #b9b2c2;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;

    &:hover:not(:disabled) {
      background: rgba(255, 146, 5, 0.18);
      color: #ffb04d;
    }

    &:disabled {
      opacity: 0.3;
      cursor: default;
    }
  }

  .strip-scroll {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    overflow-x: auto;
    scroll-behavior: smooth;
    padding: 3px 2px;

    &::-webkit-scrollbar {
      height: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
  }

  .strip-empty {
    align-self: center;
    margin: 0 auto;
    font-size: 13px;
    color: #8b8394;
  }

  .strip-cell {
    flex-shrink: 0;
    width: 132px;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;

    .cell-thumb {
      position: relative;
      aspect-ratio: 16 / 9;
      border-radius: 8px;
      overflow: hidden;
      background: #1c1824;
      border: 2px solid transparent;
      transition:
        border-color 0.15s,
        transform 0.15s,
        box-shadow 0.15s;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .cell-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #585060;
        background: #1c1824;
      }

      // 时间戳角标：右下暗底胶囊
      .cell-stamp {
        position: absolute;
        right: 4px;
        bottom: 4px;
        font-size: 10px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #ffe9cf;
        background: rgba(14, 12, 18, 0.75);
        padding: 1px 5px;
        border-radius: 5px;
      }

      // 删除按钮：右上角小圆片，与时间戳角标同配色（暗底暖白）
      .cell-del {
        position: absolute;
        top: 3px;
        right: 3px;
        opacity: 0;
        // 图标继承 currentColor，color 过渡即图标渐变（naive 自带的 transition
        // 是运行时注入，顺序在后，需 !important 才能接管）
        transition:
          opacity 0.15s,
          color 0.25s ease,
          background-color 0.25s ease !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);

        // naive 按钮无 --n-icon-color：图标继承 color:var(--n-text-color)，
        // 染色须走 text-color 系（内联下发，需 !important）
        --n-text-color: #ffe9cf !important;
        --n-text-color-hover: #ff6f6f !important;
        --n-text-color-pressed: #ff8a80 !important;
        --n-text-color-focus: #ff6f6f !important;
        --n-color: rgba(14, 12, 18, 0.75) !important;
        --n-color-hover: rgba(14, 12, 18, 0.9) !important;
        --n-color-pressed: rgba(14, 12, 18, 0.6) !important;
        --n-color-focus: rgba(14, 12, 18, 0.9) !important;
      }
    }

    &:hover .cell-del {
      opacity: 1;
    }

    .cell-title {
      margin-top: 5px;
      font-size: 12.5px;
      line-height: 1.4;
      color: #ded9e2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: color 0.15s;
    }

    &:hover .cell-thumb {
      border-color: rgba(255, 146, 5, 0.35);
    }

    &.active {
      .cell-thumb {
        border-color: #ff9205;
        transform: translateY(-2px);
        box-shadow: 0 6px 14px -6px rgba(0, 0, 0, 0.8);
      }

      .cell-title {
        color: #ffb04d;
      }
    }
  }
}
</style>

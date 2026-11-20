<template>
  <div class="highlights-view">
    <!-- 主区：影院黑底播放器（滚轮步进上一个/下一个片段） -->
    <section class="cinema-stage" @wheel="onStageWheel">
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
        <n-empty description="点击右侧缩略图选择精彩片段开始播放" />
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

    <!-- 缩略图抽屉：整体复用阅读器的 thumbnail-panel（拉手/单列/全屏三态交互一致），
         仅数据源不同 —— 这里是精彩片段条目，缩略图为时间点截帧而非文件封面 -->
    <thumbnail-panel
      :items="panelItems"
      :resolve="resolveClipThumb"
      title="精彩片段"
      empty-text="暂无精彩片段"
      :current-keys="activeKeys"
      thumb-ratio="16 / 9"
      removable
      initial-mode="column"
      @jump="onPanelJump"
      @remove="onPanelRemove"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import type { VideoBookmark } from '@/typings/video-bookmarks'
import ThumbnailPanel from '@renderer/components/thumbnail-panel.vue'

const props = defineProps<{
  searchKeyword?: string
}>()

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const highlights = ref<VideoBookmark[]>([])
const current = ref<VideoBookmark | null>(null)
const videoRef = ref<HTMLVideoElement>()
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

const extOf = (path: string) => {
  const i = path.lastIndexOf('.')
  return i === -1 ? '' : path.slice(i).toLowerCase()
}

/** 秒 → m:ss / h:mm:ss（角标/打点统一格式） */
const formatTs = (sec?: number) => {
  const s = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// ===== 缩略图数据源：片段 → thumbnail-panel 外部条目 =====
// key = 书签 id；name 进 tooltip（时间点 + 标题 + 视频名）；caption 是图下说明行；
// ext 供占位符显示
const panelItems = computed(() =>
  filteredHighlights.value.map((item) => ({
    key: String(item.id),
    name: `${formatTs(item.time_point)}${item.title ? ` ${item.title}` : ''} · ${getVideoName(item.video_path)}`,
    ext: extOf(item.video_path),
    isVideo: true,
    caption: item.title || getVideoName(item.video_path)
  }))
)

const activeKeys = computed(() =>
  current.value?.id != null ? [String(current.value.id)] : []
)

const findBookmark = (key: string) =>
  filteredHighlights.value.find((i) => String(i.id) === key)

/** 外部条目缩略图：进入视口时在片段时间点截帧 */
const resolveClipThumb = (panelItem: { key: string }) => {
  const bm = findBookmark(panelItem.key)
  return bm ? captureFrame(bm.video_path, bm.time_point) : Promise.resolve('')
}

const onPanelJump = (key: string) => {
  const bm = findBookmark(key)
  if (bm) playHighlight(bm)
}

const onPanelRemove = (key: string) => {
  const bm = findBookmark(key)
  if (bm) confirmDelete(bm)
}

// ===== 截帧：每视频一个共享 video 元素，串行队列 + 闲置释放 =====
// 同视频的片段在列表里相邻，会同时进入视口；各自开元素会把同一文件解码 N 遍
// （内存峰值 = N × 解码缓冲），队列排空 5s 后释放元素。
interface FrameWorker {
  video: HTMLVideoElement
  queue: Promise<unknown>
  pending: number
  idleTimer: number
}
const frameWorkers = new Map<string, FrameWorker>()

const releaseWorker = (videoPath: string) => {
  const w = frameWorkers.get(videoPath)
  if (!w) return
  frameWorkers.delete(videoPath)
  w.video.removeAttribute('src')
  w.video.load()
}

/** 在 videoPath 的 timePoint 处截一帧（≤200px 宽 JPEG dataURL） */
const captureFrame = (videoPath: string, timePoint: number): Promise<string> => {
  let w = frameWorkers.get(videoPath)
  if (!w) {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.src = `file://${videoPath}`
    w = { video, queue: Promise.resolve(), pending: 0, idleTimer: 0 }
    frameWorkers.set(videoPath, w)
  }
  const { video } = w
  clearTimeout(w.idleTimer)
  w.pending++

  const job = w.queue.then(
    () =>
      new Promise<string>((resolve, reject) => {
        // 单帧 15s 兜底：坏文件 file:// 元数据既不加载也不报错时事件永不触发，
        // Promise 与 video 元素会被闭包永久持有
        const timer = window.setTimeout(() => {
          cleanup()
          reject(new Error('截帧超时'))
        }, 15000)
        const cleanup = () => {
          clearTimeout(timer)
          video.removeEventListener('loadedmetadata', onMeta)
          video.removeEventListener('seeked', onSeeked)
          video.removeEventListener('error', onError)
        }
        const seek = () => {
          const target =
            timePoint > 0 && isFinite(video.duration) && timePoint < video.duration
              ? timePoint
              : 0
          video.currentTime = target
        }
        const onMeta = () => seek()
        const onSeeked = () => {
          try {
            const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 0.5625
            const cw = Math.min(200, video.videoWidth || 200)
            const ch = Math.round(cw * ratio)
            const canvas = document.createElement('canvas')
            canvas.width = cw
            canvas.height = ch
            canvas.getContext('2d')?.drawImage(video, 0, 0, cw, ch)
            cleanup()
            resolve(canvas.toDataURL('image/jpeg', 0.8))
          } catch (e) {
            cleanup()
            reject(e)
          }
        }
        const onError = () => {
          cleanup()
          reject(new Error('视频加载失败'))
        }
        video.addEventListener('loadedmetadata', onMeta)
        video.addEventListener('seeked', onSeeked)
        video.addEventListener('error', onError)
        // 元数据可能早于入队就已就绪（同视频的后续帧），直接 seek
        if (video.readyState >= 1) seek()
      })
  )
  // 单帧失败不断链（后续帧继续）；队列排空后调度闲置释放
  w.queue = job
    .catch(() => undefined)
    .then(() => {
      w.pending--
      if (w.pending === 0 && frameWorkers.get(videoPath) === w) {
        w.idleTimer = window.setTimeout(() => releaseWorker(videoPath), 5000)
      }
    })
  return job
}

const reload = async () => {
  loading.value = true
  try {
    const list = await window.videoBookmarks.getAllVideoBookmarks('created_at DESC')
    // 缩略图按 key 懒加载：已有 id 沿用缓存，新增项进入视口时截帧
    highlights.value = list

    // 默认不自动播放，等用户在缩略图抽屉里点选
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

const onLoadedMetadata = () => {
  videoDuration.value = videoRef.value?.duration || 0
  seekToCurrent()
}

// ===== 滚轮步进：滚轮切上一个/下一个片段 =====
// 累计增量过阈值才算一次手势（触控板的小增量流不误触）；步进后冷却期内
// 丢弃事件（一次滚动不跨多格）。缩略图面板内部滚轮已被其 wheel.stop 拦截。
let wheelAccum = 0
let wheelLockUntil = 0

const step = (dir: 1 | -1) => {
  const idx = filteredHighlights.value.findIndex((i) => i.id === current.value?.id)
  // 未开播时向下滚动从第一个片段起步
  const target = filteredHighlights.value[idx + dir]
  if (target) playHighlight(target)
}

const onStageWheel = (e: WheelEvent) => {
  // ctrl+滚轮是缩放手势，不抢
  if (!e.deltaY || e.ctrlKey) return
  e.preventDefault()
  if (Date.now() < wheelLockUntil) {
    wheelAccum = 0
    return
  }
  wheelAccum += e.deltaY
  if (Math.abs(wheelAccum) < 60) return
  const dir = wheelAccum > 0 ? 1 : -1
  wheelAccum = 0
  wheelLockUntil = Date.now() + 260
  step(dir)
}

onBeforeUnmount(() => {
  // 释放所有截帧 worker：脱离 DOM 的 video 仍占着解码缓冲
  for (const w of frameWorkers.values()) {
    clearTimeout(w.idleTimer)
    w.video.removeAttribute('src')
    w.video.load()
  }
  frameWorkers.clear()
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
// 影院胶片式：黑底大画幅播放器 + 右侧缩略图抽屉（复用 thumbnail-panel）
// 配色沿用全站暖橙（#ff9205 系）压暗底（#0e0c12 系），与 reader 黑底同族
.highlights-view {
  // position 供 thumbnail-panel 的绝对定位抽屉作包含块
  position: relative;
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
</style>

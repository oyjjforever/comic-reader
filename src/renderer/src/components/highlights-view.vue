<template>
  <div class="highlights-view">
    <!-- 左侧：精彩片段列表 -->
    <aside class="highlights-list">
      <div class="list-header">
        <span class="list-title">精彩片段</span>
        <span class="list-count">{{ filteredHighlights.length }}</span>
      </div>

      <div class="list-body">
        <div v-if="filteredHighlights.length === 0" class="empty-state">
          <n-empty :description="loading ? '加载中...' : '暂无精彩片段'" />
        </div>

        <div
          v-for="item in filteredHighlights"
          :key="item.id"
          class="highlight-item"
          :class="{ active: current?.id === item.id }"
          @click="playHighlight(item)"
        >
          <div class="thumb">
            <img
              v-if="thumbOf(item)"
              :src="thumbOf(item)"
              :alt="getVideoName(item.video_path)"
              @error="onThumbError(item.id)"
            />
            <div v-else class="thumb-placeholder">
              <n-icon :component="VideoIcon" :size="24" />
            </div>
          </div>

          <div class="meta">
            <div class="title" :title="item.title || getVideoName(item.video_path)">
              {{ item.title || getVideoName(item.video_path) }}
            </div>
            <div class="video-name" :title="getVideoName(item.video_path)">
              {{ getVideoName(item.video_path) }}
            </div>
          </div>

          <n-button
            class="delete-btn"
            quaternary
            circle
            size="tiny"
            :focusable="false"
            @click.stop="confirmDelete(item)"
          >
            <template #icon>
              <n-icon :component="TrashIcon" />
            </template>
          </n-button>
        </div>
      </div>
    </aside>

    <!-- 右侧：视频播放器 -->
    <section class="highlights-player">
      <template v-if="current">
        <video
          ref="videoRef"
          class="player-video"
          controls
          autoplay
          :src="`file://${current.video_path}`"
          @loadedmetadata="onLoadedMetadata"
        />
      </template>

      <div v-else class="player-empty">
        <n-empty description="选择左侧的精彩片段开始播放" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { PlayCircle as VideoIcon, Trash as TrashIcon } from '@vicons/ionicons5'
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

const filteredHighlights = computed(() => {
  const kw = (props.searchKeyword || '').trim().toLowerCase()
  if (!kw) return highlights.value
  return highlights.value.filter((item) => {
    const name = getVideoName(item.video_path).toLowerCase()
    const title = (item.title || '').toLowerCase()
    return name.includes(kw) || title.includes(kw)
  })
})

const getVideoName = (path: string) => path.split(/[/\\]/).pop() || path

const thumbOf = (item: VideoBookmark) => (item.id != null ? thumbs.value[item.id] : '')

const onThumbError = (id?: number) => {
  if (id != null) thumbs.value[id] = ''
}

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

    let index = 0
    const captureNext = () => {
      if (index >= bookmarks.length) {
        cleanup()
        resolve()
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
    video.addEventListener('error', () => {
      cleanup()
      resolve()
    })
  })

// 按视频分组，逐个视频抓取其下所有时间点的帧
const captureThumbs = async () => {
  const groups = new Map<string, VideoBookmark[]>()
  for (const item of highlights.value) {
    if (!groups.has(item.video_path)) groups.set(item.video_path, [])
    groups.get(item.video_path)!.push(item)
  }
  for (const [videoPath, group] of groups) {
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

    // 默认选中并播放第一个
    // if (list.length > 0) {
    //   current.value = list[0]
    // } else {
    //   current.value = null
    // }
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
  seekToCurrent()
}

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
    // 删除的若是当前播放项，则切换到列表第一项
    if (current.value?.id === item.id) {
      current.value = highlights.value[0] || null
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
.highlights-view {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;

  .highlights-list {
    width: 280px;
    display: flex;
    flex-direction: column;
    background-color: #f9fafb;
    border-right: 1px solid #e5e7eb;
    flex-shrink: 0;

    .list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;

      .list-title {
        font-size: 14px;
        font-weight: 600;
        color: #1f2937;
      }

      .list-count {
        font-size: 12px;
        color: #6b7280;
        background: #e5e7eb;
        padding: 2px 8px;
        border-radius: 12px;
      }
    }

    .list-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px;

      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 3px;
      }
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .highlight-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      margin-bottom: 6px;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.15s ease;
      border: 2px solid transparent;

      &:hover {
        background-color: #f3f4f6;
      }

      &.active {
        background-color: rgba(24, 160, 88, 0.1);
        border-color: #18a058;
      }

      .delete-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        opacity: 0;
        color: #f56565;
        transition: opacity 0.15s ease;
      }

      &:hover .delete-btn,
      &.active .delete-btn {
        opacity: 1;
      }

      .thumb {
        position: relative;
        width: 72px;
        height: 48px;
        border-radius: 6px;
        overflow: hidden;
        background: #000;
        flex-shrink: 0;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .thumb-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          background: #1f2937;
        }
      }

      .meta {
        flex: 1;
        min-width: 0;

        .title {
          font-size: 13px;
          font-weight: 500;
          color: #1f2937;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .video-name {
          margin-top: 2px;
          font-size: 12px;
          color: #6b7280;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }
  }

  .highlights-player {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background-color: #000;

    .player-video {
      width: 100%;
      flex: 1;
      min-height: 0;
      background-color: #000;
    }

    .player-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #1f2937;
    }
  }
}
</style>

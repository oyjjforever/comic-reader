<template>
  <div class="video-player" @click="onPlayerClick">
    <!-- 视频播放器 -->
    <video
      ref="videoRef"
      controls
      autoplay
      loop
      :key="video.fullPath"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onVideoLoaded"
    >
      <source :src="`file://${video.fullPath}`" type="video/mp4" />
    </video>

    <!-- 时间点收藏按钮 -->
    <div
      class="bookmark-controls"
      :class="{ 'controls-hidden': !showControls }"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
    >
      <n-space>
        <n-button type="primary" @click="addBookmark" :disabled="!currentTime">
          <template #icon>
            <n-icon :component="BookmarkIcon" />
          </template>
          收藏当前时间点
        </n-button>
        <n-button type="info" @click="openCast"> 投屏 </n-button>
      </n-space>
    </div>

    <!-- 时间点收藏列表 -->
    <div
      class="bookmarks-panel"
      :class="{ 'controls-hidden': !showControls || bookmarks.length === 0 }"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
    >
      <div class="bookmarks-header">
        <h3>时间点收藏</h3>
        <span class="bookmark-count">{{ bookmarks.length }}</span>
      </div>

      <div class="bookmarks-list">
        <div
          v-for="bookmark in bookmarks"
          :key="bookmark.id"
          class="bookmark-item"
          @click="jumpToBookmark(bookmark)"
        >
          <div class="bookmark-time">{{ formatTime(bookmark.time_point) }}</div>
          <div class="bookmark-title">{{ bookmark.title || '未命名收藏' }}</div>
          <div class="bookmark-actions">
            <n-button text size="tiny" @click.stop="editBookmark(bookmark)" class="edit-btn">
              <template #icon>
                <n-icon :component="EditIcon" />
              </template>
            </n-button>
            <n-button text size="tiny" @click.stop="deleteBookmark(bookmark.id)" class="delete-btn">
              <template #icon>
                <n-icon :component="TrashIcon" />
              </template>
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 投屏设备选择 -->
    <dlna-cast
      ref="castModalRef"
      :videoUrl="video.fullPath"
      contentType="video/mp4"
      @played="onCastPlayed"
    />

    <!-- 添加/编辑收藏对话框 -->
    <n-modal v-model:show="showBookmarkModal">
      <n-card
        style="width: 400px"
        title="收藏时间点"
        :bordered="false"
        size="huge"
        role="dialog"
        aria-modal="true"
      >
        <div class="bookmark-form">
          <div class="form-item">
            <label>时间点：</label>
            <span class="time-display">{{ formatTime(bookmarkForm.time_point) }}</span>
          </div>

          <div class="form-item">
            <label>标题：</label>
            <n-input
              v-model:value="bookmarkForm.title"
              placeholder="为这个时间点添加标题..."
              maxlength="50"
            />
          </div>

          <div class="form-item">
            <label>描述：</label>
            <n-input
              v-model:value="bookmarkForm.description"
              type="textarea"
              placeholder="添加描述（可选）..."
              :rows="3"
              maxlength="200"
            />
          </div>
        </div>

        <template #footer>
          <div class="modal-actions">
            <n-button @click="showBookmarkModal = false">取消</n-button>
            <n-button type="primary" @click="saveBookmark">
              {{ editingBookmark ? '更新' : '保存' }}
            </n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { Bookmark as BookmarkIcon, Create as EditIcon, Trash as TrashIcon } from '@vicons/ionicons5'
import type { VideoBookmark } from '@/typings/video-bookmarks'
import dlnaCast from './dlna-cast.vue'

const message = useMessage()
const router = useRouter()
const route = useRoute()
const props = defineProps<{
  file: Object
}>()
// 响应式数据
const videoRef = ref<HTMLVideoElement>()
const video = ref({
  contentType: '',
  fullPath: ''
})
watch(
  () => props.file,
  () => {
    fetchData()
  },
  { deep: true }
)
// UI 状态
const showControls = ref(false)
const showBookmarkModal = ref(false)
const showCastModal = ref(false)
const currentTime = ref(0)
const duration = ref(0)

// 收藏相关数据
const bookmarks = ref<VideoBookmark[]>([])
const editingBookmark = ref<VideoBookmark | null>(null)
const bookmarkForm = ref({
  time_point: 0,
  title: '',
  description: ''
})

const castModalRef = ref(null)
function openCast() {
  castModalRef.value.open()
}
function onCastPlayed() {
  message.success('投屏播放已启动')
}
// 鼠标控制相关
const AUTO_HIDE_DELAY = 3000
const autoHideTimer = ref<number | null>(null)
const isHoveringControls = ref(false)

// 播放器点击事件
const onPlayerClick = () => {
  // 切换控制栏显示状态
  showControls.value = !showControls.value

  // 如果显示控制栏，设置定时器自动隐藏
  if (showControls.value) {
    resetAutoHideTimer()
  } else {
    // 如果隐藏控制栏，清除定时器
    if (autoHideTimer.value) {
      clearTimeout(autoHideTimer.value)
      autoHideTimer.value = null
    }
  }
}

// 重置自动隐藏定时器
const resetAutoHideTimer = () => {
  if (isHoveringControls.value) return
  if (autoHideTimer.value) {
    clearTimeout(autoHideTimer.value)
  }
  autoHideTimer.value = setTimeout(() => {
    if (!isHoveringControls.value) {
      showControls.value = false
    }
  }, AUTO_HIDE_DELAY) as unknown as number
}

// 控制栏鼠标进入事件
const onControlsEnter = () => {
  isHoveringControls.value = true
  if (autoHideTimer.value) {
    clearTimeout(autoHideTimer.value)
    autoHideTimer.value = null
  }
  showControls.value = true
}

// 控制栏鼠标离开事件
const onControlsLeave = () => {
  isHoveringControls.value = false
  resetAutoHideTimer()
}

// 视频时间更新
const onTimeUpdate = () => {
  if (videoRef.value) {
    currentTime.value = videoRef.value.currentTime
  }
}

// 视频加载完成
const onVideoLoaded = () => {
  if (videoRef.value) {
    duration.value = videoRef.value.duration
  }
}

// 格式化时间显示
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
}

// 添加收藏
const addBookmark = () => {
  videoRef.value.pause()
  bookmarkForm.value = {
    time_point: currentTime.value,
    title: '',
    description: ''
  }
  editingBookmark.value = null
  showBookmarkModal.value = true
}

// 编辑收藏
const editBookmark = (bookmark: VideoBookmark) => {
  bookmarkForm.value = {
    time_point: bookmark.time_point,
    title: bookmark.title || '',
    description: bookmark.description || ''
  }
  editingBookmark.value = bookmark
  showBookmarkModal.value = true
}

// 保存收藏
const saveBookmark = async () => {
  try {
    if (editingBookmark.value) {
      // 更新现有收藏
      await window.videoBookmarks.updateVideoBookmark(
        editingBookmark.value.id,
        bookmarkForm.value.title,
        bookmarkForm.value.description
      )
      message.success('收藏更新成功')
    } else {
      // 添加新收藏
      await window.videoBookmarks.addVideoBookmark(
        video.value.fullPath,
        bookmarkForm.value.time_point,
        bookmarkForm.value.title,
        bookmarkForm.value.description
      )
      message.success('收藏添加成功')
    }

    showBookmarkModal.value = false
    videoRef.value?.play()
    await loadBookmarks()
  } catch (error: any) {
    message.error(`操作失败: ${error.message}`)
  }
}

// 删除收藏
const deleteBookmark = async (id: number) => {
  try {
    await window.videoBookmarks.deleteVideoBookmark(id)
    message.success('收藏删除成功')
    await loadBookmarks()
  } catch (error: any) {
    message.error(`删除失败: ${error.message}`)
  }
}

// 跳转到收藏时间点
const jumpToBookmark = (bookmark: VideoBookmark) => {
  if (videoRef.value) {
    videoRef.value.currentTime = bookmark.time_point
    videoRef.value.play()
  }
}

// 加载收藏列表
const loadBookmarks = async () => {
  try {
    bookmarks.value = await window.videoBookmarks.getVideoBookmarks(video.value.fullPath)
  } catch (error: any) {
    console.error('加载收藏失败:', error)
  }
}

// 获取视频数据
const fetchData = async () => {
  try {
    video.value = Object.assign(video.value, props.file)
    video.value.fullPath = decodeURIComponent(video.value.fullPath as string)
    const folderName = video.value.fullPath.split(/[/\\]/).pop() || '播放'

    // 根据内容类型设置标题
    let titlePrefix = '视频播放器 - '
    document.title = titlePrefix + folderName

    // 加载收藏列表
    await loadBookmarks()
  } catch (error: any) {
    message.error(error.message)
  }
}

// 组件挂载
onMounted(() => {
  fetchData()
})

// 组件卸载时清理定时器
onUnmounted(() => {
  if (autoHideTimer.value) {
    clearTimeout(autoHideTimer.value)
  }
})
</script>

<style lang="scss" scoped>
.video-player {
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #000;
  overflow: hidden;

  video {
    height: 100%;
    width: 100%;
    background-color: #000;
  }

  // 收藏控制按钮
  .bookmark-controls {
    position: absolute;
    top: 20px;
    left: 80px;
    z-index: 110;
    backdrop-filter: blur(10px);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;

    &.controls-hidden {
      opacity: 0;
      transform: translateY(-100%);
      pointer-events: none;
    }
  }

  // 收藏列表面板
  .bookmarks-panel {
    position: absolute;
    top: 60px;
    right: 20px;
    width: 300px;
    max-height: 400px;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    padding: 16px;
    z-index: 10;
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;

    &.controls-hidden {
      opacity: 0;
      transform: translateX(20px);
      pointer-events: none;
    }

    .bookmarks-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);

      h3 {
        color: white;
        font-size: 14px;
        font-weight: 600;
        margin: 0;
      }

      .bookmark-count {
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 8px;
        border-radius: 12px;
      }
    }

    .bookmarks-list {
      max-height: 320px;

      &::-webkit-scrollbar {
        width: 4px;
      }

      &::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
      }
    }

    .bookmark-item {
      display: flex;
      align-items: center;
      padding: 8px;
      margin-bottom: 4px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(2px);
      }

      .bookmark-time {
        color: #4caf50;
        font-size: 12px;
        font-weight: 600;
        min-width: 60px;
        margin-right: 8px;
      }

      .bookmark-title {
        flex: 1;
        color: white;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bookmark-actions {
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s ease;

        .edit-btn {
          color: #2196f3;
        }

        .delete-btn {
          color: #f56565;
        }
      }

      &:hover .bookmark-actions {
        opacity: 1;
      }
    }
  }

  // 模态框样式
  .bookmark-form {
    .form-item {
      margin-bottom: 16px;

      label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
        color: #333;
      }

      .time-display {
        color: #4caf50;
        font-weight: 600;
        font-size: 16px;
      }
    }
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}

// 响应式设计
@media (max-width: 768px) {
  .video-player {
    .bookmarks-panel {
      width: 250px;
      right: 10px;
      top: 10px;
    }

    .bookmark-controls {
      left: 10px;
      top: 10px;
    }
  }
}
</style>

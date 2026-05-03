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

    <!-- 字幕叠加层 -->
    <subtitle-overlay
      :segments="subtitleSegments"
      :current-time="currentTime"
      :visible="subtitleEnabled"
      :position="subtitleSettings.position"
      :font-size="subtitleSettings.fontSize"
      :opacity="subtitleSettings.opacity"
      :realtime-text="realtimeText"
      :is-generating="isSubtitleGenerating"
      :generate-percent="generatePercent"
      :translated-map="translatedMap"
    />

    <!-- 字幕控制按钮 -->
    <div
      class="subtitle-controls"
      :class="{ 'controls-hidden': !showControls }"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
    >
      <n-space align="center">
        <!-- 字幕开关（合并生成功能） -->
        <n-button
          :type="subtitleButtonType"
          size="small"
          :disabled="isSubtitleGenerating"
          @click="onSubtitleClick"
        >
          <template #icon>
            <n-icon :component="SubtitleIcon" />
          </template>
          <template v-if="isSubtitleGenerating">
            <span class="btn-progress">{{ generatePercent }}%</span>
          </template>
          <template v-else>
            {{ subtitleEnabled ? '字幕开' : '字幕关' }}
          </template>
        </n-button>

        <!-- 翻译开关 -->
        <n-button
          v-if="subtitleEnabled && hasSubtitleCache"
          :type="translateEnabled ? 'success' : 'error'"
          size="small"
          @click="toggleTranslate"
        >
          <template #icon>
            <n-icon :component="TranslateIcon" />
          </template>
          {{ translateEnabled ? '翻译开' : '翻译关' }}
        </n-button>

        <!-- 设置按钮 -->
        <n-popover trigger="hover" placement="top">
          <template #trigger>
            <n-button size="small" type="info" quaternary>
              <template #icon>
                <n-icon :component="SettingsIcon" />
              </template>
            </n-button>
          </template>

          <div class="subtitle-settings">
            <div class="setting-item">
              <label>语言</label>
              <n-select
                v-model:value="subtitleSettings.language"
                :options="languageOptions"
                size="small"
                style="width: 120px"
              />
            </div>

            <div class="setting-item">
              <label>字体大小</label>
              <n-slider
                v-model:value="subtitleSettings.fontSize"
                :min="14"
                :max="48"
                :step="2"
                style="width: 120px"
              />
            </div>

            <div class="setting-item">
              <label>位置</label>
              <n-radio-group v-model:value="subtitleSettings.position" size="small">
                <n-radio-button value="bottom">底部</n-radio-button>
                <n-radio-button value="top">顶部</n-radio-button>
              </n-radio-group>
            </div>

            <div class="setting-item">
              <label>透明度</label>
              <n-slider
                v-model:value="subtitleSettings.opacity"
                :min="0.3"
                :max="1"
                :step="0.1"
                style="width: 120px"
              />
            </div>

            <div class="setting-item">
              <label>翻译目标</label>
              <n-select
                v-model:value="subtitleSettings.translateTarget"
                :options="translateTargetOptions"
                size="small"
                style="width: 120px"
              />
            </div>
          </div>
        </n-popover>
      </n-space>
    </div>

    <!-- 时间点收藏按钮 -->
    <div
      class="bookmark-controls"
      :class="{ 'controls-hidden': !showControls }"
      @mouseenter="onControlsEnter"
      @mouseleave="onControlsLeave"
    >
      <n-space>
        <n-button type="success" @click="addBookmark" :disabled="!currentTime">
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
import {
  Bookmark as BookmarkIcon,
  Create as EditIcon,
  Trash as TrashIcon,
  Text as SubtitleIcon,
  Settings as SettingsIcon,
  Language as TranslateIcon
} from '@vicons/ionicons5'
import type { VideoBookmark } from '@/typings/video-bookmarks'
import type {
  SubtitleSegment,
  SubtitleLanguage,
  SubtitlePosition,
  TranslateTarget
} from '@/typings/subtitle'
import { TRANSLATE_TARGET_OPTIONS } from '@/typings/subtitle'
import dlnaCast from './dlna-cast.vue'
import subtitleOverlay from './subtitle-overlay.vue'

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

// ========== 字幕相关状态 ==========
const subtitleEnabled = ref(false)
const isSubtitleGenerating = ref(false)
const generatePercent = ref(0)
const hasSubtitleCache = ref(false)
const subtitleSegments = ref<SubtitleSegment[]>([])
const realtimeText = ref('')
const subtitleSettings = ref({
  language: 'ja' as SubtitleLanguage,
  fontSize: 24,
  position: 'bottom' as SubtitlePosition,
  opacity: 0.8,
  translateTarget: 'zh' as TranslateTarget,
  translateModelAlias: 'HY-MT1.5-1.8B-Q4_K_M'
})

// ========== 字幕 UI 配置 ==========
const languageOptions = [
  { label: '自动检测', value: 'auto' },
  { label: '日本語', value: 'ja' },
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '한국어', value: 'ko' }
]
const translateTargetOptions = TRANSLATE_TARGET_OPTIONS

// 字幕按钮样式：生成中为 info，已开启为 success，否则为 default
const subtitleButtonType = computed(() => {
  if (isSubtitleGenerating.value) return 'error'
  return subtitleEnabled.value ? 'success' : 'error'
})

// ========== 翻译相关状态 ==========
/** 已翻译的段落映射：segmentId → 翻译文本 */
const translatedMap = ref<Record<number, string>>({})
/** 翻译功能是否开启 */
const translateEnabled = ref(false)
/** 正在翻译中的段落 ID 集合（避免重复请求） */
const translatingIds = new Set<number>()
/** 预翻译的提前时间（秒） */
const TRANSLATE_LOOKAHEAD = 2
/** 本地 LLM 模型是否已加载 */
const isModelLoaded = ref(false)
/** 本地 LLM 模型是否正在加载 */
const isModelLoading = ref(false)

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

// ========== 字幕功能方法 ==========

// 统一字幕点击：无缓存时自动生成，有缓存时切换
const onSubtitleClick = () => {
  if (isSubtitleGenerating.value) return

  if (!hasSubtitleCache.value) {
    // 无缓存：触发生成，同时标记为开启
    subtitleEnabled.value = true
    onGenerateSubtitle()
  } else {
    // 有缓存：切换字幕开关
    subtitleEnabled.value = !subtitleEnabled.value
  }
}

// 生成字幕
const onGenerateSubtitle = async () => {
  if (!video.value.fullPath) return

  try {
    isSubtitleGenerating.value = true
    generatePercent.value = 0

    // 注册进度监听
    const removeListener = window.subtitle.onGenerateProgress((progress) => {
      generatePercent.value = progress.percent
    })

    const vttPath = await window.subtitle.generate(video.value.fullPath, {
      language: subtitleSettings.value.language,
      model: 'small', // 使用默认模型
      force: false
    })

    removeListener()

    // 解析 VTT 文件
    subtitleSegments.value = await window.subtitle.parseVtt(vttPath)
    hasSubtitleCache.value = true
    subtitleEnabled.value = true

    message.success(`字幕生成完成，共 ${subtitleSegments.value.length} 个段落`)
  } catch (error: any) {
    message.error(`字幕生成失败: ${error.message}`)
  } finally {
    isSubtitleGenerating.value = false
    generatePercent.value = 0
  }
}

// 切换翻译（合并原 onTranslateToggle）
const toggleTranslate = async () => {
  translateEnabled.value = !translateEnabled.value
  if (translateEnabled.value) {
    // 开启翻译时加载本地 LLM 模型
    await loadTranslateModel()
  } else {
    // 关闭翻译时卸载模型并清空数据
    translatedMap.value = {}
    translatingIds.clear()
    await unloadTranslateModel()
  }
}

/**
 * 加载本地翻译模型
 */
const loadTranslateModel = async () => {
  if (isModelLoaded.value || isModelLoading.value) return
  if (!window.electronAi) {
    console.warn('[Subtitle] window.electronAi 不可用，翻译功能无法使用')
    return
  }

  try {
    isModelLoading.value = true
    const modelAlias = subtitleSettings.value.translateModelAlias || 'HY-MT1.5-1.8B-Q4_K_M'
    const targetLang = subtitleSettings.value.translateTarget || 'zh'

    const targetLangName: Record<string, string> = {
      zh: 'Chinese',
      en: 'English',
      ja: 'Japanese',
      ko: 'Korean',
      fr: 'French',
      de: 'German',
      es: 'Spanish',
      ru: 'Russian',
      pt: 'Portuguese',
      it: 'Italian'
    }
    const langName = targetLangName[targetLang] || 'Chinese'

    await window.electronAi.create({
      modelAlias,
      systemPrompt: `You are a professional translator. Translate the following text to ${langName}. Output only the translation.`,
      temperature: 0.3
    })
    isModelLoaded.value = true
    console.log('[Subtitle] 翻译模型加载成功')
  } catch (err: any) {
    console.error('[Subtitle] 翻译模型加载失败:', err?.message)
    message?.error?.(`翻译模型加载失败: ${err?.message || '未知错误'}`)
    translateEnabled.value = false
  } finally {
    isModelLoading.value = false
  }
}

/**
 * 卸载翻译模型
 */
const unloadTranslateModel = async () => {
  if (!isModelLoaded.value || !window.electronAi) return
  try {
    await window.electronAi.destroy()
    isModelLoaded.value = false
    console.log('[Subtitle] 翻译模型已卸载')
  } catch (err: any) {
    console.warn('[Subtitle] 翻译模型卸载失败:', err?.message)
  }
}

/**
 * 翻译即将播放的字幕段落
 * 只翻译当前时间到未来5秒内、且尚未翻译的段落
 */
const translateUpcomingSegments = async () => {
  if (!translateEnabled.value || !isModelLoaded.value) return
  if (subtitleSegments.value.length === 0) return

  const time = currentTime.value
  const lookahead = time + TRANSLATE_LOOKAHEAD

  // 找出在未来5秒内开始、且尚未翻译、且不在翻译中的段落
  const upcomingSegments = subtitleSegments.value.filter(
    (seg) =>
      seg.startTime >= time &&
      seg.startTime <= lookahead &&
      !translatedMap.value[seg.id] &&
      !translatingIds.has(seg.id)
  )

  for (const seg of upcomingSegments) {
    translatingIds.add(seg.id)
    // 异步翻译，不阻塞其他段落的检测
    translateSingleSegment(seg)
  }
}

/**
 * 翻译单个字幕段落（使用本地 LLM）
 */
const translateSingleSegment = async (seg: SubtitleSegment) => {
  if (!isModelLoaded.value || !window.electronAi) return

  try {
    const translated = await window.electronAi.prompt(seg.text, { timeout: 30000 })
    // 检查翻译是否仍然启用（用户可能在请求期间关闭了翻译）
    if (translated && translateEnabled.value) {
      // 清理 LLM 可能输出的多余内容（引号、解释等）
      const cleaned = translated.trim().replace(/^["「」『』]|["「」『』]$/g, '')
      translatedMap.value = { ...translatedMap.value, [seg.id]: cleaned }
    }
  } catch (err: any) {
    console.warn(`[Subtitle] 段落 ${seg.id} 翻译失败:`, err?.message)
  } finally {
    translatingIds.delete(seg.id)
  }
}

// 加载字幕缓存
const loadSubtitleCache = async () => {
  if (!video.value.fullPath) return

  try {
    const cacheInfo = await window.subtitle.checkCache(video.value.fullPath)
    if (cacheInfo.cached && cacheInfo.subtitlePath) {
      subtitleSegments.value = await window.subtitle.parseVtt(cacheInfo.subtitlePath)
      hasSubtitleCache.value = true
    }
  } catch (error: any) {
    console.error('加载字幕缓存失败:', error)
  }
}

// 加载字幕设置
const loadSubtitleSettings = async () => {
  try {
    const settings = await window.subtitle.getSettings()
    if (settings) {
      subtitleSettings.value = {
        ...subtitleSettings.value,
        ...settings
      }
    }
  } catch (error: any) {
    console.error('加载字幕设置失败:', error)
  }
}

// 自动开始翻译（加载模型 + 开启标志，翻译会在 timeupdate 中自动触发）
const autoStartTranslate = async () => {
  if (subtitleSegments.value.length > 0 && subtitleSettings.value.translateEnabled) {
    translateEnabled.value = true
    await loadTranslateModel()
  }
}

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
    // 按需翻译即将播放的字幕
    translateUpcomingSegments()
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

    // 加载字幕设置
    await loadSubtitleSettings()

    // 加载字幕缓存
    await loadSubtitleCache()

    // 如果有缓存，直接开启字幕显示和翻译
    if (hasSubtitleCache.value && subtitleSegments.value.length > 0) {
      subtitleEnabled.value = true
      // 自动开始翻译
      await autoStartTranslate()
    }
    // 没有缓存时默认关闭，用户可手动点击字幕按钮生成
  } catch (error: any) {
    message.error(error.message)
  }
}

// 组件挂载
onMounted(() => {
  fetchData()
})

// 组件卸载时清理定时器和翻译模型
onUnmounted(async () => {
  if (autoHideTimer.value) {
    clearTimeout(autoHideTimer.value)
  }
  // 卸载翻译模型
  await unloadTranslateModel()
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

  // 字幕控制按钮
  .subtitle-controls {
    position: absolute;
    top: 16px;
    right: 200px;
    z-index: 110;
    backdrop-filter: blur(10px);
    background: rgba(0, 0, 0, 0.5);
    padding: 8px 12px;
    border-radius: 6px;
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;

    &.controls-hidden {
      opacity: 0;
      transform: translateY(-100%);
      pointer-events: none;
    }

    .btn-progress {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
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

// 字幕设置弹出面板样式
.subtitle-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;

  .setting-item {
    display: flex;
    align-items: center;
    gap: 12px;

    label {
      min-width: 60px;
      font-size: 13px;
      color: #666;
    }
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

    .subtitle-controls {
      right: 10px;
      top: 10px;
    }
  }
}
</style>

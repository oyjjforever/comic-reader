<template>
  <div class="fq-container">
    <!-- 顶栏：标签页 + 搜索 + 设备状态 -->
    <div class="fq-topbar">
      <n-tabs v-model:value="activeTab" type="line" size="small" class="fq-tabs">
        <n-tab name="latest">最新</n-tab>
        <n-tab name="search">搜索</n-tab>
        <n-tab name="shelf">书架{{ shelf.length ? ` (${shelf.length})` : '' }}</n-tab>
      </n-tabs>
      <div class="fq-topbar__right">
        <n-input
          v-model:value="keyword"
          placeholder="搜索短剧名称..."
          size="small"
          clearable
          style="width: 260px"
          @keyup.enter="onSearch"
        >
          <template #prefix>
            <n-icon :component="Search24Regular" />
          </template>
        </n-input>
        <n-tag
          v-if="device.registered && !device.cooldown"
          size="small"
          type="success"
          :bordered="false"
        >
          设备已注册
        </n-tag>
        <n-tag v-else-if="device.cooldown" size="small" type="warning" :bordered="false"
          >注册冷却中</n-tag
        >
        <n-button
          v-else
          size="small"
          type="warning"
          :loading="device.loading"
          @click="onResetDevice"
        >
          注册设备
        </n-button>
        <n-popconfirm @positive-click="onClearCache">
          <template #trigger>
            <n-button size="small" quaternary :title="`缓存 ${cacheSizeText}`">
              <template #icon>
                <n-icon :component="Delete24Regular" />
              </template>
              {{ cacheSizeText }}
            </n-button>
          </template>
          清空全部短剧缓存（{{ cacheSizeText }}）？
        </n-popconfirm>
      </div>
    </div>

    <!-- 主体：搜索结果 / 书架 -->
    <div class="fq-body">
      <n-spin :show="listLoading">
        <responsive-virtual-grid
          v-if="gridItems.length"
          ref="gridRef"
          :items="gridItems"
          key-field="bookId"
          :min-item-width="130"
          :max-item-width="200"
          :aspect-ratio="0.6"
          :gap="12"
          mode="lazy"
          class="fq-grid"
          @scroll="onGridScroll"
          @ready="onGridReady"
        >
          <template #default="{ item }">
            <div class="fq-card" @click="openDetail(item)">
              <div class="fq-card__cover">
                <img
                  v-if="item.coverUrl"
                  :src="item.coverUrl"
                  referrerpolicy="no-referrer"
                  @error="onCoverError"
                />
                <div v-else class="fq-card__placeholder">{{ item.title.slice(0, 6) }}</div>
                <div
                  v-if="item.tagText"
                  class="fq-card__tag"
                  :style="{
                    background: item.tagColors
                      ? `linear-gradient(135deg, ${item.tagColors[0]}, ${item.tagColors[1]})`
                      : undefined
                  }"
                >
                  {{ item.tagText }}
                </div>
                <div v-if="item.subtitle" class="fq-card__badge">{{ item.subtitle }}</div>
                <n-icon
                  v-if="isInShelf(item.bookId)"
                  class="fq-card__shelf-mark"
                  :component="Star24Filled"
                  size="16"
                />
              </div>
              <!-- <div class="fq-card__info">
                <div class="fq-card__title" :title="item.title">{{ item.title }}</div>
                <div v-if="item.progressText" class="fq-card__progress">
                  {{ item.progressText }}
                </div>
              </div> -->
            </div>
          </template>
        </responsive-virtual-grid>
        <div v-else-if="!listLoading" class="fq-empty">
          <n-empty
            :description="
              activeTab === 'search'
                ? '输入名称搜索短剧'
                : activeTab === 'latest'
                  ? '最新列表加载失败或为空'
                  : '书架为空，从搜索添加短剧'
            "
          />
        </div>
      </n-spin>
      <!-- 加载为静默后台进行（不做悬浮提示，避免频繁闪现）；仅到底后提示 -->
      <div
        v-if="!hasMore && gridItems.length > 0 && activeTab !== 'shelf'"
        class="fq-load-more no-more"
      >
        没有更多结果了
      </div>
    </div>

    <!-- 剧集详情覆盖层 -->
    <div v-if="detail.show" class="fq-detail">
      <div class="fq-detail__bar">
        <n-button size="small" @click="closeDetail">
          <template #icon>
            <n-icon :component="ArrowLeft24Regular" />
          </template>
          返回
        </n-button>
        <span class="fq-detail__title" :title="detail.title">{{
          detail.title || '加载中...'
        }}</span>
        <div class="fq-detail__actions">
          <n-button
            size="small"
            :type="detail.inShelf ? 'warning' : 'default'"
            :loading="detail.loadingInfo"
            @click="toggleShelf"
          >
            <template #icon>
              <n-icon :component="detail.inShelf ? Star24Filled : Star24Regular" />
            </template>
            {{ detail.inShelf ? '移出书架' : '加入书架' }}
          </n-button>
        </div>
      </div>
      <div class="fq-detail__body">
        <n-spin v-if="detail.loadingInfo" class="fq-detail__spin" />
        <template v-else>
          <div class="fq-detail__meta">
            <div class="fq-detail__cover">
              <img
                v-if="detail.coverUrl"
                :src="detail.coverUrl"
                referrerpolicy="no-referrer"
                @error="onCoverError"
              />
              <div v-else class="fq-card__placeholder">{{ (detail.title || '?').slice(0, 6) }}</div>
            </div>
            <div class="fq-detail__desc">
              <div class="fq-detail__name">{{ detail.title }}</div>
              <div v-if="detail.subtitle" class="fq-detail__sub">{{ detail.subtitle }}</div>
              <div v-if="detail.abstract" class="fq-detail__abstract">{{ detail.abstract }}</div>
              <div class="fq-detail__ops">
                <n-button
                  size="small"
                  type="success"
                  :disabled="!detail.episodes.length"
                  @click="playEpisode(detail.resumeIndex ?? 0, true)"
                >
                  <template #icon>
                    <n-icon :component="PlayCircle" />
                  </template>
                  {{ detail.resumeIndex ? `继续看 第${detail.resumeIndex + 1}集` : '开始播放' }}
                </n-button>
              </div>
            </div>
          </div>
          <div class="fq-detail__eps-title">共 {{ detail.episodes.length }} 集</div>
          <div class="fq-detail__eps">
            <button
              v-for="ep in detail.episodes"
              :key="ep.videoId"
              class="fq-ep"
              :class="{
                'fq-ep--cached': ep.cached,
                'fq-ep--resume': ep.index === detail.resumeIndex
              }"
              :title="ep.title"
              @click="playEpisode(ep.index, false)"
            >
              {{ ep.index + 1 }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- 播放器覆盖层 -->
    <div v-if="player.show" class="fq-player">
      <div class="fq-player__bar">
        <n-button size="small" type="primary" @click="closePlayer">
          <template #icon>
            <n-icon :component="ArrowLeft24Regular" />
          </template>
          返回
        </n-button>
        <span class="fq-player__title" :title="player.title">{{ player.title }}</span>
        <div class="fq-player__ops">
          <n-button
            size="tiny"
            type="primary"
            :disabled="player.index <= 0"
            @click="playEpisode(player.index - 1, false)"
          >
            上一集
          </n-button>
          <div class="fq-player__pos">第 {{ player.index + 1 }} / {{ player.total }} 集</div>
          <n-button
            size="tiny"
            type="primary"
            :disabled="player.index >= player.total - 1"
            @click="playEpisode(player.index + 1, false)"
          >
            下一集
          </n-button>
        </div>
      </div>
      <div class="fq-player__stage">
        <div v-if="player.loading" class="fq-player__mask">
          <n-spin size="large" />
          <span class="fq-player__mask-text">{{ player.loadingText }}</span>
        </div>
        <div v-if="player.error" class="fq-player__mask">
          <n-empty :description="player.error" />
          <n-button
            v-if="player.index < player.total - 1"
            size="small"
            @click="playEpisode(player.index + 1, false)"
          >
            跳过本集
          </n-button>
        </div>
        <video
          v-show="!player.loading && !player.error"
          ref="videoRef"
          class="fq-player__video"
          controls
          autoplay
          @ended="onEnded"
          @error="onVideoError"
          @timeupdate="onTimeUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" name="fanqie">
import {
  Search24Regular,
  Star24Regular,
  Star24Filled,
  ArrowLeft24Regular,
  Delete24Regular
} from '@vicons/fluent'
import { PlayCircle } from '@vicons/ionicons5'
import ResponsiveVirtualGrid from '@renderer/components/responsive-virtual-grid.vue'

interface ShelfBook {
  bookId: string
  title: string
  subtitle?: string
  abstract?: string
  coverUrl?: string
  episodeCount?: number
  tagText?: string
  tagColors?: [string, string]
  /** 上次看到第几集（0 起）；时间点（秒） */
  lastEpisodeIndex?: number
  lastTime?: number
  updatedAt: number
}

interface GridCard {
  bookId: string
  title: string
  subtitle?: string
  abstract?: string
  coverUrl?: string
  episodeCount?: number
  progressText?: string
  tagText?: string
  tagColors?: [string, string]
}

const message = useMessage()
const fanqie = window.fanqie

// ===== 设备状态 =====
const device = reactive({ registered: false, cooldown: false, loading: false })

async function refreshDeviceStatus() {
  try {
    const s = await fanqie.getDeviceStatus()
    device.registered = s.registered
    device.cooldown = s.cooldown
  } catch {
    /* 忽略 */
  }
}

async function onResetDevice() {
  device.loading = true
  try {
    await fanqie.resetDevice()
    message.success('设备注册成功')
  } catch (e: any) {
    message.error(e?.message || '设备注册失败，可能 IP 被风控')
  } finally {
    device.loading = false
    refreshDeviceStatus()
  }
}

// ===== 缓存统计与清理 =====
const cacheSizeText = ref('')

async function refreshCacheSize() {
  try {
    const size = await fanqie.getCacheSize()
    cacheSizeText.value =
      size >= 1073741824
        ? `${(size / 1073741824).toFixed(1)}GB`
        : size >= 1048576
          ? `${(size / 1048576).toFixed(0)}MB`
          : `${(size / 1024).toFixed(0)}KB`
  } catch {
    /* 忽略 */
  }
}

async function onClearCache() {
  try {
    await fanqie.clearCache()
    message.success('缓存已清空')
    refreshCacheSize()
  } catch (e: any) {
    message.error(e?.message || '清理失败')
  }
}

// ===== 列表（搜索 / 最新 / 书架） =====
const activeTab = ref<'latest' | 'search' | 'shelf'>('latest')
const keyword = ref('')
const listLoading = ref(false)
const searchResults = ref<GridCard[]>([])
const latestResults = ref<GridCard[]>([])
const gridRef = ref<any>(null)

const SHELF_KEY = 'fanqie:shelf'
const shelf = ref<ShelfBook[]>(loadShelf())

function loadShelf(): ShelfBook[] {
  try {
    const arr = JSON.parse(localStorage.getItem(SHELF_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveShelf() {
  localStorage.setItem(SHELF_KEY, JSON.stringify(shelf.value))
}

function getShelfBook(bookId: string): ShelfBook | undefined {
  return shelf.value.find((b) => b.bookId === bookId)
}

function isInShelf(bookId: string): boolean {
  return !!getShelfBook(bookId)
}

/** 封面加载失败（签名过期等）：隐藏破图，露出渐变底 */
function onCoverError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img) img.style.display = 'none'
}

const gridItems = computed<GridCard[]>(() => {
  if (activeTab.value === 'search') return searchResults.value
  if (activeTab.value === 'latest') return latestResults.value
  return shelf.value.map((b) => ({
    bookId: b.bookId,
    title: b.title,
    subtitle: b.subtitle,
    abstract: b.abstract,
    coverUrl: b.coverUrl,
    episodeCount: b.episodeCount,
    tagText: b.tagText,
    tagColors: b.tagColors,
    progressText:
      b.lastEpisodeIndex !== undefined
        ? `看到第 ${b.lastEpisodeIndex + 1} 集`
        : b.episodeCount
          ? `全 ${b.episodeCount} 集`
          : ''
  }))
})

// ===== 滚动分页（搜索 offset 每页 20 条；漫剧 feed 内部游标分页） =====
const searchOffset = ref(0)
const hasMore = ref(true)
const loadingMore = ref(false)
let activeKeyword = ''
// 两个流各自维护去重集合（切换 tab 后互不污染）
const seenMap: Record<'search' | 'latest', Set<string>> = { search: new Set(), latest: new Set() }

interface SearchRow {
  bookId: string
  title: string
  subtitle?: string
  abstract?: string
  coverUrl?: string
  episodeCount?: number
  tagText?: string
  tagColors?: [string, string]
}

function toCard(r: SearchRow): GridCard {
  return {
    bookId: r.bookId,
    title: r.title,
    subtitle: r.subtitle || (r.episodeCount ? `全${r.episodeCount}集` : ''),
    abstract: r.abstract,
    coverUrl: r.coverUrl,
    episodeCount: r.episodeCount,
    tagText: r.tagText,
    tagColors: r.tagColors
  }
}

/** 当前列表流取下一页（搜索传 offset；漫剧 feed 内部维护游标） */
function fetchPage(offset: number): Promise<SearchRow[]> {
  if (activeTab.value === 'latest') return fanqie.latest() as Promise<SearchRow[]>
  if (!activeKeyword) return Promise.resolve([])
  return fanqie.search(activeKeyword, offset) as Promise<SearchRow[]>
}

async function onSearch() {
  const kw = keyword.value.trim()
  if (!kw) return
  activeTab.value = 'search'
  listLoading.value = true
  activeKeyword = kw
  searchOffset.value = 0
  hasMore.value = true
  seenMap.search.clear()
  try {
    const list = (await fanqie.search(kw, 0)) as SearchRow[]
    searchResults.value = []
    appendResults(list)
    if (!list.length) message.info('未找到相关短剧')
  } catch (e: any) {
    message.error(e?.message || '搜索失败')
    refreshDeviceStatus()
  } finally {
    listLoading.value = false
  }
}

/** 首次进入"最新"tab 时加载 */
async function loadLatest() {
  if (latestResults.value.length || listLoading.value) return
  listLoading.value = true
  hasMore.value = true
  seenMap.latest.clear()
  fanqie.resetLatest()
  try {
    const list = (await fanqie.latest()) as SearchRow[]
    latestResults.value = []
    appendResults(list)
  } catch (e: any) {
    message.error(e?.message || '漫剧列表加载失败')
    refreshDeviceStatus()
  } finally {
    listLoading.value = false
  }
}

/** 追加去重后的新条目（写入当前流）；返回新增数量（服务端推荐流会重排，页间重复常见） */
function appendResults(list: SearchRow[]): number {
  const seen = seenMap[activeTab.value === 'latest' ? 'latest' : 'search']
  const fresh = list.filter((r) => !seen.has(r.bookId))
  for (const r of fresh) seen.add(r.bookId)
  const target = activeTab.value === 'latest' ? latestResults : searchResults
  target.value.push(...fresh.map(toCard))
  if (list.length === 0) hasMore.value = false
  return fresh.length
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value || listLoading.value) return
  if (activeTab.value !== 'search' && activeTab.value !== 'latest') return
  if (activeTab.value === 'search' && !activeKeyword) return
  loadingMore.value = true
  try {
    const pageSize = 20 // 搜索每页 20 条（与接口 count 对齐；漫剧 feed 忽略该值）
    // 整页重复时自动追页（推荐流重排导致），最多连追 2 页
    let retries = 0
    while (hasMore.value && retries < 3) {
      const list = await fetchPage(searchOffset.value + pageSize)
      if (activeTab.value === 'search') searchOffset.value += pageSize
      const added = appendResults(list)
      if (added > 0) break
      retries++
    }
    if (retries >= 3) hasMore.value = false
  } catch (e: any) {
    message.error(e?.message || '加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

// 切换 tab：最新未加载过时自动拉取
watch(activeTab, (tab) => {
  if (tab === 'latest') loadLatest()
})

// 网格滚动：距底部剩约半屏时才加载下一页（按可视条数动态判断，
// 修复列表不满一页时"滚一点就触发"的问题）
function onGridScroll() {
  const stats = gridRef.value?.getStats?.()
  if (!stats) return
  const { start, end } = stats.visibleRange
  const visibleSpan = end - start + 1
  if (end >= gridItems.value.length - Math.ceil(visibleSpan / 2) && hasMore.value && !loadingMore.value) {
    loadMore()
  }
}

function onGridReady() {
  // 首屏不满时预取下一页
  nextTick(() => {
    const stats = gridRef.value?.getStats?.()
    if (stats && stats.visibleRange.end >= gridItems.value.length - 1) loadMore()
  })
}

// ===== 剧集详情 =====
const detail = reactive({
  show: false,
  loadingInfo: false,
  bookId: '',
  title: '',
  subtitle: '',
  abstract: '',
  coverUrl: '',
  tagText: '',
  tagColors: null as [string, string] | null,
  inShelf: false,
  resumeIndex: 0 as number | undefined,
  episodes: [] as Array<{ videoId: string; title: string; index: number; cached: boolean }>
})

async function openDetail(card: GridCard) {
  detail.show = true
  detail.loadingInfo = true
  detail.bookId = card.bookId
  detail.title = card.title
  detail.subtitle = card.subtitle || ''
  detail.abstract = card.abstract || ''
  detail.coverUrl = card.coverUrl || ''
  detail.tagText = card.tagText || ''
  detail.tagColors = card.tagColors || null
  detail.episodes = []
  const book = getShelfBook(card.bookId)
  detail.inShelf = !!book
  detail.resumeIndex = book?.lastEpisodeIndex
  try {
    const series = await fanqie.getSeries(card.bookId, card.title)
    if (detail.bookId !== card.bookId) return // 已切换
    detail.title = series.title
    detail.episodes = await Promise.all(
      series.episodes.map(async (ep) => ({
        ...ep,
        cached: await fanqie.hasEpisode(card.bookId, ep.videoId)
      }))
    )
    // 已在书架：用本次拿到的封面/简介/标题回写书架条目（封面签名 URL 过期后自愈）
    const book = getShelfBook(card.bookId)
    if (book) {
      if (card.coverUrl) book.coverUrl = card.coverUrl
      if (card.abstract) book.abstract = card.abstract
      if (card.tagText) {
        book.tagText = card.tagText
        book.tagColors = card.tagColors
      }
      book.title = series.title
      book.episodeCount = series.episodes.length || book.episodeCount
      saveShelf()
    }
  } catch (e: any) {
    message.error(e?.message || '获取剧集信息失败')
    refreshDeviceStatus()
  } finally {
    detail.loadingInfo = false
  }
}

function closeDetail() {
  detail.show = false
}

function toggleShelf() {
  if (detail.inShelf) {
    shelf.value = shelf.value.filter((b) => b.bookId !== detail.bookId)
    message.success('已移出书架')
  } else {
    shelf.value.unshift({
      bookId: detail.bookId,
      title: detail.title,
      subtitle: detail.subtitle,
      abstract: detail.abstract,
      coverUrl: detail.coverUrl,
      episodeCount: detail.episodes.length || undefined,
      tagText: detail.tagText || undefined,
      tagColors: detail.tagColors || undefined,
      lastEpisodeIndex: detail.resumeIndex,
      updatedAt: Date.now()
    })
    message.success('已加入书架')
  }
  detail.inShelf = !detail.inShelf
  saveShelf()
}

// ===== 播放器 =====
const videoRef = ref<HTMLVideoElement | null>(null)
const player = reactive({
  show: false,
  bookId: '',
  title: '',
  episodes: [] as Array<{ videoId: string; title: string; index: number }>,
  index: 0,
  total: 0,
  loading: false,
  loadingText: '',
  error: ''
})

let progressSaveTimer: ReturnType<typeof setTimeout> | null = null

async function playEpisode(index: number, resume: boolean) {
  if (!detail.episodes.length) return
  const ep = detail.episodes[index]
  if (!ep) return
  const book = getShelfBook(detail.bookId)
  const seekTime = resume ? book?.lastTime ?? 0 : 0

  player.show = true
  player.bookId = detail.bookId
  player.title = detail.title
  player.episodes = detail.episodes.map((e) => ({
    videoId: e.videoId,
    title: e.title,
    index: e.index
  }))
  player.total = player.episodes.length
  player.index = index
  player.loading = true
  player.error = ''
  player.loadingText = '解析视频流...'

  // 同步详情层的续看位置
  detail.resumeIndex = index
  persistProgress(0)

  try {
    const result = await fanqie.ensureEpisode(detail.bookId, ep.videoId, index, (p) => {
      if (p.stage === 'download') {
        player.loadingText =
          p.total && p.total > 0
            ? `缓存中 ${(p.got! / 1048576).toFixed(1)}/${(p.total / 1048576).toFixed(1)}MB`
            : '缓存中...'
      } else if (p.stage === 'decrypt') {
        player.loadingText = '解密中...'
      } else if (p.stage === 'resolve') {
        player.loadingText = '解析视频流...'
      }
    })
    if (player.bookId !== detail.bookId) return
    player.loading = false
    await nextTick()
    const video = videoRef.value
    if (!video) return
    video.src = result.url
    if (seekTime > 1) {
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = Math.min(seekTime, Math.max(video.duration - 2, 0))
        },
        { once: true }
      )
    }
    video.play().catch(() => {})
    // 更新详情面板缓存标记 + 预取下一集
    const hit = detail.episodes.find((e) => e.videoId === ep.videoId)
    if (hit) hit.cached = true
    const next = player.episodes[index + 1]
    if (next) fanqie.prefetchEpisode(detail.bookId, next.videoId, next.index)
  } catch (e: any) {
    if (player.bookId !== detail.bookId) return
    player.loading = false
    player.error = e?.message || '播放失败'
    refreshDeviceStatus()
  }
}

function onEnded() {
  if (player.index < player.total - 1) {
    playEpisode(player.index + 1, false)
  } else {
    persistProgress(player.index, 0)
    message.info('已看完最后一集')
    closePlayer()
  }
}

function onVideoError() {
  player.loading = false
  player.error = '视频播放出错（本集编码可能不受支持）'
}

function onTimeUpdate() {
  if (progressSaveTimer) return
  progressSaveTimer = setTimeout(() => {
    progressSaveTimer = null
    persistProgress(player.index, videoRef.value?.currentTime ?? 0)
  }, 5000)
}

/** 保存观看进度到书架条目（在书架才记录） */
function persistProgress(index: number, time?: number) {
  const book = getShelfBook(player.bookId || detail.bookId)
  if (!book) return
  book.lastEpisodeIndex = index
  if (time !== undefined) book.lastTime = time
  book.updatedAt = Date.now()
  saveShelf()
}

function closePlayer() {
  persistProgress(player.index, videoRef.value?.currentTime ?? 0)
  if (progressSaveTimer) {
    clearTimeout(progressSaveTimer)
    progressSaveTimer = null
  }
  player.show = false
  player.error = ''
}

onMounted(() => {
  refreshDeviceStatus()
  refreshCacheSize()
  // 默认进入"最新"tab，自动加载
  loadLatest()
})

onUnmounted(() => {
  if (progressSaveTimer) clearTimeout(progressSaveTimer)
})
</script>

<style lang="scss" scoped>
.fq-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  background: #f5f6f8;
  position: relative;
  overflow: hidden;
}

.fq-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 12px;

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.fq-tabs {
  min-width: 180px;
}

.fq-body {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  position: relative;

  :deep(.n-spin-container),
  :deep(.n-spin-content) {
    height: 100%;
  }
}

.fq-grid {
  height: 100%;
}

/* 加载指示器：底部悬浮，不占布局流 */
.fq-load-more {
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 12px;
  color: #666;
  background: rgba(245, 246, 248, 0.85);
  backdrop-filter: blur(4px);
  pointer-events: none;
  z-index: 5;

  &.no-more {
    color: #aaa;
    background: transparent;
    backdrop-filter: none;
  }
}

.fq-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fq-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  transition:
    box-shadow 0.2s,
    transform 0.2s;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  }

  &__cover {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__placeholder {
    color: #bbb;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    padding: 6px;
    word-break: break-all;
  }

  &__tag {
    position: absolute;
    top: 6px;
    left: 6px;
    padding: 1px 7px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    border-radius: 4px 4px 4px 0;
    background: linear-gradient(135deg, #ff9052, #fa6725);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    z-index: 1;
  }

  &__badge {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 2px 6px;
    font-size: 11px;
    color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__shelf-mark {
    position: absolute;
    top: 6px;
    right: 6px;
    color: #f7ba2a;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  &__info {
    flex-shrink: 0;
    padding: 6px 8px;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__progress {
    margin-top: 2px;
    font-size: 11px;
    color: #999;
  }
}

/* 详情覆盖层 */
.fq-detail {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: #f5f6f8;
  display: flex;
  flex-direction: column;
  border-radius: 14px;

  &__bar {
    flex-shrink: 0;
    height: 48px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: #fff;
    border-bottom: 1px solid #eee;
  }

  &__title {
    flex: 1;
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
  }

  &__spin {
    margin: 80px auto;
  }

  &__meta {
    display: flex;
    gap: 16px;
    background: #fff;
    border-radius: 12px;
    padding: 14px;
  }

  &__cover {
    width: 110px;
    height: 150px;
    flex-shrink: 0;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__desc {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__name {
    font-size: 17px;
    font-weight: 700;
    color: #1a1a1a;
  }

  &__sub {
    font-size: 12px;
    color: #ff7043;
  }

  &__abstract {
    font-size: 13px;
    color: #666;
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__ops {
    margin-top: auto;
    display: flex;
    gap: 8px;
  }

  &__eps-title {
    margin: 16px 2px 8px;
    font-size: 13px;
    font-weight: 600;
    color: #555;
  }

  &__eps {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 8px;
    padding-bottom: 16px;
  }
}

.fq-ep {
  height: 36px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;

  &:hover {
    border-color: #ff7043;
    color: #ff7043;
  }

  &--cached::after {
    content: '';
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #18a058;
  }

  &--resume {
    border-color: #ff7043;
    color: #ff7043;
    font-weight: 600;
  }
}

/* 播放器覆盖层 */
.fq-player {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: #000;
  display: flex;
  flex-direction: column;
  border-radius: 14px;

  &__bar {
    flex-shrink: 0;
    height: 46px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: rgba(20, 20, 20, 0.92);
    color: #fff;
  }

  &__title {
    flex: 1;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__pos {
    font-size: 12px;
    color: #bbb;
    flex-shrink: 0;
    line-height: 22px;
  }

  &__ops {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  &__stage {
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__video {
    width: 100%;
    height: 100%;
    background: #000;
  }

  &__mask {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: #fff;
    z-index: 2;
  }

  &__mask-text {
    font-size: 13px;
    color: #ccc;
  }
}
</style>

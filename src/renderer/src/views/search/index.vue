<template>
  <div class="search-container">
    <!-- 搜索表单 -->
    <div class="search-form">
      <n-space>
        <n-select
          v-model:value="searchType"
          :options="typeOptions"
          placeholder="选择网站类型"
          style="width: 120px"
        />
        <n-input
          v-model:value="keyword"
          placeholder="输入搜索关键字"
          @keyup.enter="handleSearch"
          clearable
        />
        <n-button type="primary" @click="handleSearch" :loading="loading" :disabled="!keyword">
          <template #icon>
            <n-icon :component="Search24Regular" />
          </template>
          搜索
        </n-button>
      </n-space>
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchResults.length > 0" class="search-results">
      <div class="results-header">
        <span class="results-count">找到 {{ searchResults.length }} 个结果</span>
      </div>
      <responsive-virtual-grid
        ref="virtualGridRef"
        :items="searchResults"
        key-field="id"
        :min-item-width="100"
        :max-item-width="100"
        :aspect-ratio="0.75"
        :gap="10"
        mode="lazy"
        @scroll="handleScroll"
        @ready="onGridReady"
      >
        <template #default="{ item }">
          <div class="search-item" :class="{ 'search-item--downloaded': item.downloaded }">
            <div class="item-cover">
              <!-- 加载中状态 -->
              <div v-if="item.loading" class="loading-placeholder">
                <n-spin size="small" />
              </div>
              <!-- 已加载状态 -->
              <template v-else-if="item.loaded">
                <n-image v-if="item.cover" :src="item.cover" class="cover-image">
                  <template #error>
                    <img :src="errorImg" />
                  </template>
                </n-image>
                <div v-else class="default-cover">
                  <n-icon :component="Image24Regular" size="48" />
                </div>
                <!-- 悬浮操作栏 -->
                <div v-if="item.artworkId" class="hover-ops">
                  <div v-if="item.pages" class="item-pages">
                    <n-icon :component="SlideMultiple24Regular" size="12" />{{ item.pages }}
                  </div>
                  <button size="small" @click.stop="onDownload(item)">
                    <n-icon :component="CloudDownload" size="24" />
                  </button>
                  <button size="small" @click.stop="onPreview(item)">
                    <n-icon :component="InformationCircle" size="24" />
                  </button>
                </div>
              </template>
              <!-- 未加载状态 -->
              <div v-else class="default-cover">
                <n-icon :component="Image24Regular" size="48" />
              </div>
            </div>
            <div class="item-info">
              <h3 class="item-title" :title="item.title">{{ item.title || '加载中...' }}</h3>
              <div class="item-meta">
                <span v-if="item.author" class="item-author">{{ item.author }}</span>
              </div>
            </div>
          </div>
        </template>
      </responsive-virtual-grid>
    </div>

    <!-- 空状态 -->
    <div v-else-if="hasSearched && !loading" class="empty-state">
      <n-icon :component="Search24Regular" size="64" color="#ccc" />
      <p class="empty-text">未找到相关结果</p>
    </div>

    <!-- 初始状态 -->
    <div v-else-if="!hasSearched" class="initial-state">
      <n-icon :component="Search24Regular" size="64" color="#e0e0e0" />
      <p class="initial-text">请输入关键字开始搜索</p>
    </div>

    <!-- 预览弹窗 -->
    <preview-dialog
      v-if="previewer.show"
      :dialog="previewer"
      @download="onDownload"
    ></preview-dialog>
  </div>
</template>

<script setup lang="ts" name="search">
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import { NSelect, NInput, NButton, NIcon, NImage, NSpin } from 'naive-ui'
import { Search24Regular, Image24Regular, SlideMultiple24Regular } from '@vicons/fluent'
import { CloudDownload, InformationCircle } from '@vicons/ionicons5'
import ResponsiveVirtualGrid from '../../components/responsive-virtual-grid.vue'
import previewDialog from '../special-attention/preview-dialog.vue'
import errorImg from '@renderer/assets/error.png'
import siteUtils from '../special-attention/site-utils.js'
import { useSettingStore } from '@renderer/plugins/store'

// 网站类型选项
const typeOptions = [
  { label: '全部', value: 'all' },
  { label: 'JM', value: 'jmtt' },
  { label: 'Pixiv', value: 'pixiv' },
  { label: 'Picaman', value: 'picaman' }
]

// 搜索表单状态
const searchType = ref('all')
const keyword = ref('')
const loading = ref(false)
const hasSearched = ref(false)

// 搜索结果（占位符数组，每项包含 {id, artworkId, source, loaded, loading, ...details}）
const searchResults = ref<any[]>([])

// 虚拟网格引用
const virtualGridRef = ref()

// 预览弹窗状态
const previewer = reactive({
  show: false,
  data: {}
})

// 正在加载详情的ID集合，防止重复请求
const loadingDetailIds = new Set<string>()

// 处理搜索
const handleSearch = async () => {
  if (!keyword.value.trim()) return

  loading.value = true
  hasSearched.value = true
  searchResults.value = []
  loadingDetailIds.clear()

  try {
    const typesToSearch = searchType.value === 'all' ? ['jmtt', 'pixiv', 'picaman'] : [searchType.value]

    // 并行搜索各站点，返回 {id, source} 占位符列表
    const allPlaceholders = await Promise.all(
      typesToSearch.map(async (type) => {
        try {
          const ids = await siteUtils.searchArtworks(type, keyword.value)
          if (!ids || !Array.isArray(ids)) return []
          return ids.map((id: any) => ({
            id: `${type}_${id}`,
            artworkId: id,
            source: type,
            loaded: false,
            loading: false,
            title: '',
            author: '',
            cover: '',
            pages: 0,
            downloaded: false
          }))
        } catch (error) {
          console.error(`搜索 ${type} 失败:`, error)
          return []
        }
      })
    )

    // 合并所有站点的搜索结果
    searchResults.value = allPlaceholders.flat()
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    loading.value = false
  }
}

// 加载可视区域内未加载项的详情
const loadVisibleDetails = async () => {
  const stats = virtualGridRef.value?.getStats()
  if (!stats || searchResults.value.length === 0) return

  const { start, end } = stats.visibleRange
  const itemsToLoad: any[] = []

  for (let i = start; i <= end && i < searchResults.value.length; i++) {
    const item = searchResults.value[i]
    if (item && !item.loaded && !item.loading && !loadingDetailIds.has(item.id)) {
      itemsToLoad.push(item)
      loadingDetailIds.add(item.id)
    }
  }

  if (itemsToLoad.length === 0) return

  // 标记为加载中
  itemsToLoad.forEach((item) => {
    item.loading = true
  })

  // 并行加载详情
  await Promise.all(
    itemsToLoad.map(async (item) => {
      try {
        const details = await siteUtils.getArtworkInfo(item.source, item.artworkId)
        if (details) {
          Object.assign(item, details, { loaded: true, loading: false })
        } else {
          item.loading = false
        }
      } catch (error) {
        console.error(`获取 ${item.artworkId} 详情失败:`, error)
        item.loading = false
      } finally {
        loadingDetailIds.delete(item.id)
      }
    })
  )
}

// 网格滚动事件处理
const handleScroll = () => {
  loadVisibleDetails()
}

// 网格就绪后加载首批可见项
const onGridReady = async () => {
  await nextTick()
  loadVisibleDetails()
}

// 下载单个作品
const onDownload = async (row: any) => {
  await siteUtils.downloadArtwork(row.source, row, {})
  row.downloaded = true
}

// 预览作品
const onPreview = (row: any) => {
  previewer.data = row
  previewer.show = true
}

// 剪切板内容变化时更新搜索关键字
const settingStore = useSettingStore()
const getClipboardContent = async () => {
  if (!settingStore.setting.autoFillClipboard) return
  // 通过 IPC 从主进程读取当前剪切板内容
  const text = await window.clipboard.readText()
  if (text) {
    keyword.value = text.trim()
  }
}

onMounted(async () => {
  getClipboardContent()
  window.electron.ipcRenderer.on('clipboard-content', getClipboardContent)
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener('clipboard-content', getClipboardContent)
})
</script>

<style lang="scss" scoped>
.search-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: #f5f5f5;
}

.search-form {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.search-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.results-header {
  padding: 12px 0;
  margin-bottom: 16px;
}

.results-count {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.search-item {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);

    .hover-ops {
      opacity: 1;
    }
  }

  &--downloaded {
    .cover-image,
    .default-cover {
      opacity: 0.5;
    }
  }
}

.item-cover {
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #f0f0f0;
  overflow: hidden;
  position: relative;
}

.cover-image {
  width: 100%;
  height: 100%;

  :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: cover !important;
  }
}

.default-cover {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 加载中占位 */
.loading-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
}

/* 页数指示器 */
.item-pages {
  width: fit-content;
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 2px;
  position: absolute;
  top: 5px;
  right: 5px;
  color: #fff;
  background: #00000071;
  backdrop-filter: blur(10px);
  border-radius: 5px;
  font-size: 12px;
  padding: 0px 4px;
  z-index: 1;
}

/* 悬浮操作栏 */
.hover-ops {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 10%;
  gap: 5px;
  justify-content: flex-end;
  align-items: center;
  background: #000000ad;
  color: #fff;
  transition: opacity 0.25s ease;
  z-index: 9999;

  button {
    transition-duration: 0.3s;
    &:hover {
      transition-duration: 0.3s;
      transform: scale(1.2);
    }
  }
}

.item-info {
  padding: 12px;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.item-type {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e3f2fd;
  color: #1976d2;
  font-weight: 500;
}

.item-author {
  font-size: 12px;
  color: #999;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state,
.initial-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.empty-text,
.initial-text {
  margin-top: 16px;
  font-size: 16px;
  color: #999;
}

@media (max-width: 768px) {
  .search-container {
    padding: 16px;
  }

  .search-form {
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }

  .item-info {
    padding: 10px;
  }

  .item-title {
    font-size: 13px;
  }
}
</style>

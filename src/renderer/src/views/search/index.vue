<template>
  <div class="search-container">
    <!-- 搜索表单 -->
    <div class="search-form">
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
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchResults.length > 0" class="search-results">
      <div class="results-header">
        <span class="results-count">找到 {{ searchResults.length }} 个结果</span>
      </div>
      <responsive-virtual-grid
        :items="searchResults"
        key-field="id"
        :min-item-width="100"
        :max-item-width="100"
        :aspect-ratio="0.75"
        :gap="10"
      >
        <template #default="{ item }">
          <div class="search-item" @click="handleItemClick(item)">
            <div class="item-cover">
              <img
                v-if="item.cover"
                :src="item.cover"
                :alt="item.title"
                class="cover-image"
                @error="onImageError(item)"
              />
              <div v-else class="default-cover">
                <n-icon :component="Image24Regular" size="48" />
              </div>
            </div>
            <div class="item-info">
              <h3 class="item-title" :title="item.title">{{ item.title }}</h3>
              <div class="item-meta">
                <span class="item-type">{{ item.type }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NSelect, NInput, NButton, NIcon } from 'naive-ui'
import { Search24Regular, Image24Regular } from '@vicons/fluent'
import ResponsiveVirtualGrid from '../../components/responsive-virtual-grid.vue'

// 网站类型选项
const typeOptions = [
  { label: '全部', value: 'all' },
  { label: 'JM', value: 'jmtt' },
  { label: 'Pixiv', value: 'pixiv' }
]

// 搜索表单状态
const searchType = ref('all')
const keyword = ref('')
const loading = ref(false)
const hasSearched = ref(false)

// 搜索结果
const searchResults = ref<any[]>([])

// 处理搜索
const handleSearch = async () => {
  if (!keyword.value.trim()) return

  loading.value = true
  hasSearched.value = true
  searchResults.value = []

  try {
    const typesToSearch = searchType.value === 'all' ? ['jmtt', 'pixiv'] : [searchType.value]

    const allResults = await Promise.all(
      typesToSearch.map(async (type) => {
        try {
          // 调用对应的搜索方法
          const searchMethod = (window as any)[type]?.search
          if (!searchMethod) {
            console.error(`${type} 搜索方法不存在`)
            return []
          }

          const ids = await searchMethod(keyword.value)

          // 获取详细信息
          const details = await Promise.all(
            ids.map(async (id: string) => {
              try {
                // 根据类型调用不同的获取信息方法
                const getInfoMethod = (window as any)[type]?.[
                  type === 'jmtt' ? 'getComicInfo' : 'getArtworkInfo'
                ]
                if (!getInfoMethod) {
                  console.error(`${type} getComicInfo/getArtworkInfo 方法不存在`)
                  return null
                }

                const info = await getInfoMethod(id)
                console.log('🚀 ~ handleSearch ~ info:', info)

                // 获取封面图片
                let cover = ''
                try {
                  const getImageMethod = (window as any)[type]?.getImage
                  if (getImageMethod && info.cover) {
                    cover = await getImageMethod(info.cover)
                    console.log('🚀 ~ handleSearch ~ cover:', cover)
                  }
                } catch (error) {
                  console.error('获取封面失败:', error)
                }

                return {
                  id: `${type}-${id}`,
                  artworkId: id,
                  type: type.toUpperCase(),
                  title: info.title || '未知标题',
                  author: info.author || '',
                  cover: cover,
                  info: info
                }
              } catch (error) {
                console.error(`获取 ${id} 信息失败:`, error)
                return null
              }
            })
          )

          return details.filter((item) => item !== null)
        } catch (error) {
          console.error(`搜索 ${type} 失败:`, error)
          return []
        }
      })
    )

    searchResults.value = allResults.flat()
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    loading.value = false
  }
}

// 处理图片加载错误
const onImageError = (item: any) => {
  item.cover = ''
}

// 处理项目点击
const handleItemClick = (item: any) => {
  // 根据类型跳转到对应的详情页面
  if (item.type === 'JMTT') {
    // 跳转到 JM 详情页
    console.log('跳转到 JM 详情页:', item.artworkId)
  } else if (item.type === 'PIXIV') {
    // 跳转到 Pixiv 详情页
    console.log('跳转到 Pixiv 详情页:', item.artworkId)
  }
}
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
  }
}

.item-cover {
  width: 100%;
  flex: 1;
  aspect-ratio: 3/4;
  background: #f0f0f0;
  overflow: hidden;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

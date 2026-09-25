<template>
  <n-modal
    :show="show"
    preset="card"
    :title="`分享作品（按匹配度排序，共 ${candidates.length} 条）`"
    class="share-modal"
    style="width: 600px"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div v-if="fileName" class="share-filename" :title="fileName">{{ fileName }}</div>
    <div class="share-keyword">
      <span class="share-keyword-label">搜索关键字:</span>
      <n-input
        v-model:value="searchKeyword"
        size="small"
        placeholder="编辑搜索关键字后重新搜索"
        clearable
        :disabled="loading"
        @keydown.enter="onSearch"
      />
      <n-button
        size="small"
        type="primary"
        :loading="loading"
        :disabled="!searchKeyword.trim()"
        @click="onSearch"
      >
        搜索
      </n-button>
    </div>
    <div v-if="loading" class="share-loading">
      <n-spin size="medium" />
      <span>正在搜索作品信息...</span>
    </div>
    <div v-else-if="candidates.length === 0" class="share-empty">未搜索到相关作品</div>
    <div v-else class="share-list">
      <div
        v-for="{ info, segments } in rows"
        :key="`${info.source}_${info.artworkId}`"
        class="share-item"
        @click="emit('select', info)"
      >
        <img class="share-item-icon" :src="getSiteIcon(info.source)" />
        <div class="share-item-info">
          <div class="share-item-title" :title="info.title">
            <template v-if="segments">
              <span
                v-for="(seg, i) in segments"
                :key="i"
                :class="{ 'share-item-highlight': seg.highlight }"
                >{{ seg.text }}</span
              >
            </template>
            <template v-else>{{ info.title || '无标题' }}</template>
          </div>
          <div class="share-item-meta">
            作者: {{ info.author || '未知' }} | ID: {{ info.artworkId }}
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NModal, NSpin, NInput, NButton } from 'naive-ui'
import siteUtils from '@renderer/plugins/site-utils/index.js'
import { buildTitleSegments } from '@renderer/utils/share-match'

interface Candidate {
  info: any
  score: number
}

const props = defineProps<{
  show: boolean
  candidates: Candidate[]
  keyword?: string
  fileName?: string
  loading?: boolean
}>()

const emit = defineEmits(['update:show', 'select', 'search'])

// 可编辑的搜索关键字，随外部传入的关键字同步
const searchKeyword = ref(props.keyword || '')
watch(
  () => props.keyword,
  (value) => {
    searchKeyword.value = value || ''
  }
)

// 二次编辑后重新搜索
const onSearch = () => {
  const keyword = searchKeyword.value.trim()
  if (!keyword || props.loading) return
  emit('search', keyword)
}

const getSiteIcon = (source: string) => siteUtils.getSiteIcon(source)

// 预计算每条候选标题与本地作品名对比的高亮片段，避免模板中重复调用
const rows = computed(() =>
  props.candidates.map((candidate) => ({
    ...candidate,
    segments: buildTitleSegments(candidate.info.title, props.fileName || props.keyword || '')
  }))
)
</script>

<style lang="scss" scoped>
.share-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 0;
  color: #6b7280;
  font-size: 14px;
}

.share-empty {
  padding: 32px 0;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

.share-filename {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  word-break: break-all;
  line-height: 1.4;
}

.share-keyword {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;

  .n-input {
    flex: 1;
  }

  .n-button {
    flex-shrink: 0;
  }
}

.share-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 50vh;
  overflow: auto;
}

.share-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #18a058;
    background-color: #f0faf4;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.06);
  }

  .share-item-icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .share-item-info {
    flex: 1;
    min-width: 0;

    .share-item-title {
      font-size: 14px;
      font-weight: 500;
      color: #1f2937;
      overflow: hidden;
      text-overflow: ellipsis;

      .share-item-highlight {
        color: #d97706;
        background-color: #fef3c7;
        border-radius: 2px;
        padding: 0 1px;
      }
    }

    .share-item-meta {
      font-size: 12px;
      color: #6b7280;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 2px;
    }
  }

  .n-tag {
    flex-shrink: 0;
  }

  .share-item-index {
    flex-shrink: 0;
    font-size: 12px;
    color: #9ca3af;
    min-width: 18px;
    text-align: right;
  }
}
</style>

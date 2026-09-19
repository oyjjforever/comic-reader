<template>
  <n-modal
    :show="show"
    preset="card"
    :title="`分享作品（按匹配度排序，共 ${candidates.length} 条）`"
    class="share-modal"
    style="width: 600px"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div v-if="keyword" class="share-keyword">
      <span class="share-keyword-label">搜索关键字:</span>
      <span class="share-keyword-text">{{ keyword }}</span>
    </div>
    <div class="share-list">
      <div
        v-for="({ info, score }, index) in candidates"
        :key="`${info.source}_${info.artworkId}`"
        class="share-item"
        @click="emit('select', info)"
      >
        <img class="share-item-icon" :src="getSiteIcon(info.source)" />
        <div class="share-item-info">
          <div class="share-item-title" :title="info.title">{{ info.title || '无标题' }}</div>
          <div class="share-item-meta">作者: {{ info.author || '未知' }} | ID: {{ info.artworkId }}</div>
        </div>
        <n-tag size="small" type="info">{{ info.source }}</n-tag>
        <n-tag size="small" v-bind="matchBadge(score)">{{ matchBadge(score).label }}</n-tag>
        <span class="share-item-index">{{ index + 1 }}</span>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { NModal, NTag } from 'naive-ui'
import siteUtils from '@renderer/plugins/site-utils/index.js'

interface Candidate {
  info: any
  score: number
}

defineProps<{
  show: boolean
  candidates: Candidate[]
  keyword?: string
}>()

const emit = defineEmits(['update:show', 'select'])

const getSiteIcon = (source: string) => siteUtils.getSiteIcon(source)

// 根据匹配可信度返回标签样式
const matchBadge = (score: number): { type: 'success' | 'warning' | 'default'; label: string } => {
  if (score >= 900) return { type: 'success', label: '完全匹配' }
  if (score >= 500) return { type: 'warning', label: '包含匹配' }
  return { type: 'default', label: `相似度 ${Math.round(score)}%` }
}
</script>

<style lang="scss" scoped>
.share-keyword {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 13px;

  .share-keyword-label {
    color: #6b7280;
    flex-shrink: 0;
  }

  .share-keyword-text {
    color: #1f2937;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    transform: translateY(-1px);
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
      white-space: nowrap;
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

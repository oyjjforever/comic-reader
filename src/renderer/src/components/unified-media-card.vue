<template>
  <cd-media-card
    v-if="isVideoCard"
    :item="item"
    :namespace="namespace"
    :show-count="showCount"
    @open="emit('open', $event)"
  />
  <book-media-card
    v-else
    :item="item"
    :namespace="namespace"
    :show-count="showCount"
    @open="emit('open', $event)"
  />
</template>

<script setup lang="ts">
import BookMediaCard from '@renderer/components/book-media-card.vue'
import CdMediaCard from '@renderer/components/cd-media-card.vue'
import type { MediaItem } from '@/typings/media'

interface Props {
  /** 统一媒体条目（唯一必填参数） */
  item: MediaItem
  /** 评分/浏览历史的命名空间，默认取 item.source */
  namespace?: string
  /** 是否显示页数（标题横幅副行） */
  showCount?: boolean
}

interface Emits {
  (e: 'open', item: MediaItem): void
}

const props = withDefaults(defineProps<Props>(), {
  namespace: '',
  showCount: true
})

const emit = defineEmits<Emits>()

/** 视频文件（kind=video）与全视频文件夹（videoFolder）用光盘盒形态 */
const isVideoCard = computed(() => props.item.kind === 'video' || !!props.item.videoFolder)
</script>

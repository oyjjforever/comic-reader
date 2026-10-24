<template>
  <div class="image-reader">
    <div class="image-wrapper" :style="imageTransformStyle">
      <img
        :src="`file://${file.fullPath}`"
        :alt="file.name"
        class="main-image"
        :class="{ 'pair-image': !!nextFile }"
        @dragstart.prevent
        @error="onImageError"
      />
      <!-- 双页模式：与当前页并排显示的下一页 -->
      <img
        v-if="nextFile"
        :src="`file://${nextFile.fullPath}`"
        :alt="nextFile.name"
        class="main-image pair-image"
        @dragstart.prevent
        @error="onImageError"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FileInfo } from '@/typings/file'
// Props
defineProps<{
  file: FileInfo
  // 双页模式下与当前页并排显示的下一页
  nextFile?: FileInfo
}>()

const onImageError = () => {}
const imageTransformStyle = computed(() => ({
  transform: `scale(1)`,
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}))
</script>

<style lang="scss" scoped>
.image-reader {
  @apply w-full h-full relative overflow-hidden;
  background: #1a1a1a;
  cursor: none;

  &:hover {
    cursor: default;
  }
  .image-wrapper {
    @apply flex items-center justify-center w-full h-full;
    transform-origin: center center;
    gap: 4px;
  }

  .main-image {
    @apply w-full h-full object-contain select-none;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

  /* 双页模式：两页并排，各自最多占一半宽度 */
  .pair-image {
    width: auto;
    max-width: 50%;
  }
}
/* 全屏时的样式调整 */
:fullscreen {
  .image-reader {
    background: #000;
  }
}
</style>

<template>
  <div class="image-reader">
    <div class="image-wrapper" :style="imageTransformStyle">
      <img
        :src="`file://${file.fullPath}`"
        :alt="file.name"
        class="main-image"
        @dragstart.prevent
        @error="onImageError"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
// Props
const props = defineProps<{
  file: Object
}>()

const router = useRouter()
const message = useMessage()
const onImageError = () => {}
const imageTransformStyle = computed(() => ({
  transform: `scale(1)`,
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}))
onMounted(() => {})
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
  }

  .main-image {
    @apply w-full h-full object-contain select-none;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
}
/* 全屏时的样式调整 */
:fullscreen {
  .image-reader {
    background: #000;
  }
}
</style>

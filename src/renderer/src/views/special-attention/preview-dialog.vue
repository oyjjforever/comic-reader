<template>
  <n-modal v-model:show="dialog.show">
    <div class="modal-container">
      <button class="close-button" @click="closeModal">
        <n-icon :component="CloseOutline" size="24" />
      </button>

      <div class="modal-content">
        <div class="image-gallery">
          <div
            v-for="(url, index) in dialog.data.imageUrls || []"
            :key="index"
            class="image-item"
            :data-index="index"
            ref="imageItems"
          >
            <div v-if="!loadedImages[index]" class="image-placeholder">
              <span>加载中...</span>
            </div>
            <n-image
              v-else
              :src="loadedImages[index]"
              :alt="`Image ${index + 1}`"
              class="gallery-image"
            />
          </div>
        </div>
        <div class="project-details">
          <div class="project-header">
            <h2 class="project-title">{{ dialog.data.title }}</h2>
            <div class="image-count">
              <n-icon :component="SlideMultiple24Regular" size="16" />
              <span style="margin-left: 5px">包含 {{ dialog.data.pages }} 张图片</span>
            </div>
          </div>

          <div class="project-description">
            <p>{{ dialog.data.description }}</p>
          </div>

          <div class="action-buttons-container">
            <div class="download-button-container">
              <button @click="handleDownload" class="download-button">
                <span>下载作品</span>
              </button>
            </div>
            <div class="share-button-container">
              <button @click="copyLink" class="share-button">
                <span>{{ shareButtonText }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import PixivUtil from './pixiv.js'
import TwitterUtil from './twitter.js'
import JmttUtil from './jmtt.js'
import { CloseOutline } from '@vicons/ionicons5'
import { SlideMultiple24Regular } from '@vicons/fluent'
// Define props
const props = defineProps({
  dialog: {
    type: Object,
    required: true
  }
})

// Define emits
const emit = defineEmits(['close', 'download'])

// Reactive state
const shareButtonText = ref('分享链接')
const loadedImages = reactive({})
const observer = ref(null)
const imageItems = ref([])

// Methods
const closeModal = () => {
  emit('close')
  props.dialog.show = false
}

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(
      `作品名:${props.dialog.data.title}
作品ID: ${props.dialog.data.artworkId}
作者: ${props.dialog.data.author}
来源: ${props.dialog.data.source}`
    )
    shareButtonText.value = '已复制！'
    setTimeout(() => {
      shareButtonText.value = '分享链接'
    }, 2000)
  } catch (err) {
    console.error('Failed to copy: ', err)
    shareButtonText.value = '复制失败'
    setTimeout(() => {
      shareButtonText.value = '分享链接'
    }, 2000)
  }
}

const handleDownload = () => {
  emit('download', props.dialog.data)
}

const loadImage = async (index) => {
  if (loadedImages[index] || !props.dialog.data.imageUrls || !props.dialog.data.imageUrls[index]) {
    return
  }
  try {
    const blobUrl = await downloadAndConvertToBlob(props.dialog.data.imageUrls[index])
    loadedImages[index] = blobUrl
  } catch (error) {
    console.error(`Failed to load image at index ${index}:`, error)
  }
}

// 占位方法：下载URL并通过blob转换成内存URL
const downloadAndConvertToBlob = async (url) => {
  try {
    if (props.dialog.data.source === 'pixiv') {
      return await PixivUtil.previewImage(url)
    } else if (props.dialog.data.source === 'twitter') {
      return await TwitterUtil.previewImage(url)
    } else if (props.dialog.data.source === 'jmtt') {
      return await JmttUtil.previewImage(url)
    }
  } catch (error) {
    console.error('Failed to download image:', error)
    return null
  }
}

const setupIntersectionObserver = () => {
  // 创建 Intersection Observer 实例
  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = parseInt(entry.target.dataset.index)
          if (index !== undefined && !loadedImages[index]) {
            loadImage(index)
          }
        }
      })
    },
    {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    }
  )
}

const observeImages = () => {
  // 观察所有图片元素
  nextTick(() => {
    if (imageItems.value) {
      imageItems.value.forEach((item) => {
        if (item && observer.value) {
          observer.value.observe(item)
        }
      })
    }
  })
}

// Lifecycle hooks
onMounted(() => {
  // 设置交叉观察器
  setupIntersectionObserver()
  observeImages()
  // 立即加载前几张图片
  if (props.dialog.data.imageUrls && props.dialog.data.imageUrls.length > 0) {
    // 预加载前3张图片
    for (let i = 0; i < Math.min(3, props.dialog.data.imageUrls.length); i++) {
      loadImage(i)
    }
  }
})

onBeforeUnmount(() => {
  // 清理观察器
  if (observer.value) {
    observer.value.disconnect()
  }
})
</script>

<style lang="scss" scoped>
@keyframes scale-in {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.modal-container {
  position: relative;
  max-height: 90vh;
  height: 90vh;
  width: 60%;
  background-color: white;
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: auto;
  transition: all 0.3s ease;
  animation: scale-in 0.3s ease-out forwards;
}

.close-button {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 10;
  background-color: rgba(255, 255, 255, 0.8);
  color: #374151;
  transition: all 0.2s ease;
  border: none;

  &:hover {
    background-color: rgba(255, 255, 255, 1);
  }
}

.modal-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  @media (min-width: 1024px) {
    flex-direction: row;
  }
}

.image-gallery {
  width: 100%;
  position: relative;
  overflow: auto;
  margin: 10px 0;
  padding: 0 10px;

  @media (min-width: 1024px) {
    width: 66.666667%;
  }

  // 隐藏滚动条
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #d1d5db;
    border-radius: 3px;
  }
}

.image-item {
  width: 100%;
  display: flex;
  justify-content: center;
}

.gallery-image {
  width: 100%;
  height: auto;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
  margin-bottom: 5px;
}

.project-details {
  width: 100%;
  padding: 1.5rem 1.5rem 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e5e7eb;

  @media (min-width: 1024px) {
    width: 33.333333%;
  }
}

.project-header {
  margin-bottom: 1.5rem;
}

.project-title {
  font-size: 26px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 0.5rem;
  word-break: break-all;
}

.image-count {
  display: flex;
  align-items: center;
  color: #4b5563;
  margin-bottom: 1rem;

  .fas {
    margin-right: 0.5rem;
  }
}

.project-description {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
  margin-bottom: 1.5rem;

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #d1d5db;
    border-radius: 3px;
  }

  p {
    color: #374151;
    line-height: 1.625;
    white-space: pre-line;
  }
}

.action-buttons-container {
  display: flex;
  gap: 0.75rem;
  margin-top: auto;
}

.download-button-container {
  flex: 1;
}

.download-button {
  width: 100%;
  padding: 0.55rem 1rem;
  background: linear-gradient(to right, #10b981, #059669);
  color: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transform: translateY(-0.125rem);
  }
}

.share-button-container {
  flex: 1;
}

.share-button {
  width: 100%;
  padding: 0.55rem 1rem;
  background: linear-gradient(to right, #3b82f6, #4f46e5);
  color: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transform: translateY(-0.125rem);
  }
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  width: 100%;
  background-color: #f3f4f6;
  color: #6b7280;
  font-size: 0.875rem;
  border-radius: 0.5rem;

  .fa-spinner {
    margin-bottom: 0.5rem;
    font-size: 1.5rem;
  }
}
.n-modal-mask {
  border-radius: 24px;
}
</style>

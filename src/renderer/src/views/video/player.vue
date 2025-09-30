<template>
  <div class="video-player">
    <video muted loop preload="metadata" ref="videoRef" controls autoplay>
      <source :src="`file://${video.fullPath}`" type="video/mp4" />
    </video>
  </div>
</template>

<script setup lang="ts">
const message = useMessage()
const router = useRouter()
const route = useRoute()
const videoRef = ref()
const video = ref({
  contentType: '',
  fullPath: ''
})
// 获取数据（书籍或文件夹）
const fetchData = async () => {
  try {
    video.value = Object.assign(video.value, route.query)
    video.value.fullPath = decodeURIComponent(video.value.fullPath as string)
    const folderName = video.value.fullPath.split(/[/\\]/).pop() || '播放'

    // 根据内容类型设置标题
    let titlePrefix = '视频播放器 - '
    document.title = titlePrefix + folderName
  } catch (error: any) {
    message.error(error.message)
  }
}
onMounted(() => {
  fetchData()
})
</script>

<style lang="scss" scoped>
.video-player {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  video {
    height: 100%;
    width: 100%;
    background-color: #000;
  }
}
</style>

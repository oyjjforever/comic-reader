<template>
  <canvas ref="canvasRef" class="ugoira-canvas"></canvas>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  frames: Array<{ url: string; delay: number }>
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let images: HTMLImageElement[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let index = 0

function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function loadAndPlay() {
  clearTimer()
  images = []
  index = 0
  if (!props.frames || props.frames.length === 0) return
  Promise.all(
    props.frames.map(
      (f) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = f.url
        })
    )
  ).then((loaded) => {
    images = loaded.filter(Boolean) as HTMLImageElement[]
    const canvas = canvasRef.value
    if (!canvas || images.length === 0) return
    canvas.width = images[0].naturalWidth
    canvas.height = images[0].naturalHeight
    index = 0
    draw()
  })
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas || images.length === 0) return
  const img = images[index]
  if (img) {
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
  }
  const delay = props.frames[index]?.delay || 100
  index = (index + 1) % images.length
  timer = setTimeout(draw, delay)
}

onMounted(loadAndPlay)
onBeforeUnmount(clearTimer)
watch(() => props.frames, loadAndPlay)
</script>

<style scoped>
.ugoira-canvas {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>

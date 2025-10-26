<template>
  <!-- EPUB 阅读器 -->
  <epub-reader v-if="book.contentType === 'epub'" :folderPath="book.folderPath"></epub-reader>
  <!-- 图片阅读器 -->
  <img-reader v-else-if="book.contentType === 'image'" :folderPath="book.folderPath"></img-reader>
  <!-- PDF 阅读器 -->
  <pdf-reader
    v-else-if="book.contentType === 'pdf'"
    :folderPath="book.folderPath"
    :currentPage="currentPage"
    @update:currentPage="handlePageUpdate"
  ></pdf-reader>

  <!-- 加载状态 -->
  <div v-else class="w-full h-full flex justify-center items-center">
    <n-spin size="large">
      <template #description> 加载中... </template>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import epubReader from './epub-reader.vue'
import imgReader from './image-reader.vue'
import pdfReader from './pdf-reader.vue'
import { useMessage } from 'naive-ui'
const route = useRoute()
const router = useRouter()
const message = useMessage()

// 定义书籍数据
const book = ref({
  contentType: '',
  folderPath: ''
})

// 定义当前页面（用于PDF阅读）
const currentPage = ref(1)
// 获取数据（书籍或文件夹）
const fetchData = async () => {
  try {
    book.value = Object.assign(book.value, route.query)
    book.value.folderPath = decodeURIComponent(book.value.folderPath as string)

    // 设置初始页面
    if (route.query.page) {
      currentPage.value = parseInt(route.query.page as string) || 1
    }
    const folderName = book.value.folderPath.split(/[/\\]/).pop() || '阅读'

    // 根据内容类型设置标题
    let titlePrefix = '漫画阅读器 - '
    document.title = titlePrefix + folderName
  } catch (error: any) {
    message.error(error.message)

    // 返回上一页
    router.back()
  }
}

// 处理页面更新（PDF阅读器）
const handlePageUpdate = (page: number) => {
  currentPage.value = page

  // 更新URL中的页面参数，但不刷新页面
  const newQuery = { ...route.query, page: page.toString() }
  router.replace({ query: newQuery })
}

// 页面挂载时获取数据
onMounted(() => {
  fetchData()
})
</script>

<style scoped></style>

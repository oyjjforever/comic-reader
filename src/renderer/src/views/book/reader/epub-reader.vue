<template>
  <div class="w-full h-full relative">
    <div class="flex flex-col w-full h-full">
      <div class="flex-grow">
        <div id="epub-reader" class="w-full h-full"></div>
      </div>

      <div class="my-2 relative">
        <div class="flex">
          <div class="flex-1 flex justify-center">
            <n-tag :bordered="false">
              {{ paginationData.page }} / {{ paginationData.pageCount }}
            </n-tag>
          </div>
          <div class="flex-1 flex justify-center" v-if="paginationData.displayedTotal == 2">
            <n-tag :bordered="false">
              {{ paginationData.page + (paginationData.displayedTotal - 1) }} /
              {{ paginationData.pageCount }}
            </n-tag>
          </div>
        </div>

        <div class="absolute right-3 bottom-0">
          <n-dropdown trigger="hover" :options="menuOptions" @select="menuHandleSelect">
            <n-button strong secondary>
              <n-icon>
                <menu-icon />
              </n-icon>
            </n-button>
          </n-dropdown>
        </div>
      </div>
    </div>

    <div class="absolute left-4 top-1/2 transform -translate-y-1/2">
      <n-button text @click="prevPage">
        <n-icon :depth="2" :size="40">
          <left-icon />
        </n-icon>
      </n-button>
    </div>
    <div class="absolute right-4 top-1/2 transform -translate-y-1/2">
      <n-button text @click="nextPage">
        <n-icon :depth="2" :size="40">
          <right-icon />
        </n-icon>
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import epub from '@renderer/tools/epub'
import { Rendition } from 'epubjs'
import { ChevronLeft12Filled as leftIcon, ChevronRight12Filled as rightIcon } from '@vicons/fluent'
import { Menu as menuIcon, Home as homeIcon, SettingsSharp as settingIcon } from '@vicons/ionicons5'
import { Mutex } from 'async-mutex'
import useSetting from '@renderer/components/setting'
import { useSettingStore } from '@renderer/plugins/store'
import { NText, NIcon, NSlider } from 'naive-ui'
const message = useMessage()
const router = useRouter()
const setting = useSetting()
const settingStore = useSettingStore()
const osTheme = useOsTheme()

// 定义props
const props = defineProps({
  folderPath: {
    type: String,
    required: true
  }
})
const paginationData = ref({
  page: 1,
  displayedTotal: 1,
  pageCount: 1
})
// 定义emits
const emits = defineEmits(['update:pagination'])

// 渲染图标
const renderIcon = (icon: Component) => {
  return () => {
    return h(NIcon, null, {
      default: () => h(icon)
    })
  }
}
// 定义渲染器
let rendition: Rendition | null = null

// 定义菜单选项
const menuOptions = [
  {
    label: '返回主页',
    key: 'home',
    icon: renderIcon(homeIcon)
  },
  {
    label: '设置',
    key: 'setting',
    icon: renderIcon(settingIcon)
  },
  {
    key: 'progress',
    type: 'render',
    render: () => {
      return h(
        'div',
        {
          class: 'm-3 w-72'
        },
        [
          h(
            NText,
            {},
            {
              default: () => '进度'
            }
          ),
          h(
            'div',
            {
              class: 'flex items-center'
            },
            [
              h(NSlider, {
                min: 1,
                max: paginationData.value.pageCount,
                formatTooltip: (value: number) => {
                  return `${value} / ${paginationData.value.pageCount}`
                },
                value: paginationData.value.page,
                onUpdateValue: (value: number) => {
                  paginationData.value.page = value
                },
                onDragend: progressDragend
              }),
              h(
                NText,
                {
                  class: 'ml-2 whitespace-nowrap'
                },
                {
                  default: () =>
                    `${paginationData.value.page != 1 ? Math.round((paginationData.value.page / paginationData.value.pageCount) * 100) : 0} % `
                }
              )
            ]
          )
        ]
      )
    }
  }
]

// 设置主题
const setTheme = () => {
  if (rendition) {
    // 检查是否为自动模式
    if (settingStore.setting.theme == 'auto') {
      // 检查系统主题
      if (osTheme.value == 'dark') {
        rendition.themes.select('dark')
      } else {
        rendition.themes.select('light')
      }
      return
    }

    // 检查是否为黑暗模式
    if (settingStore.setting.theme == 'dark') {
      rendition.themes.select('dark')
      return
    }

    rendition.themes.select('light')
  }
}

// 渲染epub阅读器
const render = async () => {
  const imageFiles = await window.book.getFiles(props.folderPath)
  console.log(imageFiles)
  // 读取epub文件
  window.fs.readFile(imageFiles[0].fullPath, async (err: any, data: Buffer) => {
    if (err) {
      // 读取文件失败
      console.error(err)
      message.error('读取文件失败')

      // 返回上一页
      router.back()
    }

    // 解析epub文件
    let bookData = await epub.parse(data.buffer)
    console.log(bookData)

    // 创建渲染器
    rendition = bookData.book.renderTo('epub-reader', {
      width: '100%',
      height: '100%',
      manager: 'continuous', // 布局方式
      flow: 'paginated', // 翻页方式
      spread: 'auto', // 双页显示
      resizeOnOrientationChange: true, // 屏幕尺寸变化时自动调整
      allowScriptedContent: true // 允许脚本
    })

    // 注册主题
    rendition.themes.register('dark', {
      body: {
        color: '#fff',
        background: '#101014'
      }
    })
    rendition.themes.register('light', {
      body: {
        color: '#000',
        background: '#fff'
      }
    })

    // 设置主题
    setTheme()

    // 渲染
    await rendition.display(paginationData.value.page - 1)

    let location: any = rendition.currentLocation()
    // 写入分页数据
    paginationData.value.pageCount = bookData.spine.length
    paginationData.value.displayedTotal = location.start.displayed.total
  })
}

// 翻页锁
let togglePageLock = new Mutex()

// 下一页
const nextPage = async () => {
  // 上锁
  const release = await togglePageLock.acquire()
  if (rendition) {
    let currentEndPage = paginationData.value.page + (paginationData.value.displayedTotal - 1)
    // 检查是否为最后一页
    if (currentEndPage >= paginationData.value.pageCount) {
      message.warning('已经是最后一页了')
      // 释放锁
      release()
      return
    }

    // 更新分页数据
    paginationData.value.page = paginationData.value.page + paginationData.value.displayedTotal

    // 检查页面总数是否为偶数
    if (paginationData.value.pageCount % 2 != 0) {
      // 检查是否为倒数第二页
      if (currentEndPage == paginationData.value.pageCount - 1) {
        // 更新分页数据
        paginationData.value.displayedTotal = 1

        // 切换到单页显示
        rendition.spread('none')
      }
    }

    await rendition.display(paginationData.value.page - 1)

    // 释放锁
    release()
  }
}

// 上一页
const prevPage = async () => {
  // 上锁
  const release = await togglePageLock.acquire()
  if (rendition) {
    // 检查是否为第一页
    if (paginationData.value.page == 1) {
      message.warning('已经是第一页了')
      // 释放锁
      release()
      return
    }

    // 检查是否为单页显示，如果是则切换到双页显示
    if (paginationData.value.displayedTotal == 1) {
      // 切换到双页显示
      rendition.spread('auto')

      let location: any = rendition.currentLocation()
      // 更新分页数据
      paginationData.value.displayedTotal = location.start.displayed.total

      // 更新渲染器，解决错页问题
      await rendition.display(paginationData.value.page - 1)
    }

    // 更新分页数据
    paginationData.value.page = paginationData.value.page - paginationData.value.displayedTotal

    await rendition.display(paginationData.value.page - 1)

    // 释放锁
    release()
  }
}

// 进度条拖放回调
const progressDragend = async () => {
  // 上锁
  const release = await togglePageLock.acquire()
  if (rendition) {
    // 检查是否为单页显示，如果是则切换到双页显示
    if (paginationData.value.displayedTotal == 1) {
      // 切换到双页显示
      rendition.spread('auto')

      let location: any = rendition.currentLocation()
      // 更新分页数据
      paginationData.value.displayedTotal = location.start.displayed.total
    }

    // 检查是否是拖到最后一页
    if (paginationData.value.page == paginationData.value.pageCount) {
      // 检查页面总数是否为奇数，且是否为双页显示
      if (paginationData.value.pageCount % 2 == 1 && paginationData.value.displayedTotal == 2) {
        // 切换到单页显示
        rendition.spread('none')

        // 更新分页数据
        paginationData.value.displayedTotal = 1
      }
    }

    await rendition.display(paginationData.value.page - 1)
  }

  // 释放锁
  release()
}

// 菜单选项选择事件
const menuHandleSelect = (key: string) => {
  switch (key) {
    case 'home':
      router.push({
        name: 'home'
      })
      break
    case 'setting':
      setting.open()
      break
  }
}

// 监听主题设置变化
watch(
  () => settingStore.setting.theme,
  () => {
    setTheme()
  }
)

// 组件挂载时加载数据
onMounted(() => {
  render()
})

// 离开页面时销毁渲染器
onUnmounted(() => {
  if (rendition) {
    rendition.destroy()
  }
})
</script>

<style scoped></style>

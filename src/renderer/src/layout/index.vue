<template>
  <div class="layout-container">
    <!-- 左侧导航栏 -->
    <div class="sidebar">
      <!-- Logo区域 -->
      <div class="logo-section">
        <div class="logo-icon">
          <img src="@renderer/assets/icon.png" />
        </div>
      </div>

      <!-- 导航菜单 -->
      <div class="nav-menu">
        <div
          v-for="(item, index) in menuItems"
          :key="index"
          class="menu-item"
          :class="{ active: currentRoute === item.name }"
          @click="handleMenuClick(index, item.name)"
        >
          <n-icon
            v-if="item.icon"
            size="25"
            :color="currentRoute === item.name ? '#ffffff' : '#9ca3af'"
          >
            <component :is="item.icon" />
          </n-icon>
          <img v-if="item.image" :src="item.image" width="30" height="30" />
        </div>
      </div>

      <!-- 底部菜单 -->
      <div class="bottom-menu">
        <div
          v-for="(item, index) in bottomMenuItems"
          :key="index"
          class="menu-item"
          :class="{ active: currentRoute === item.name }"
          @click="handleMenuClick(index, item.name)"
        >
          <n-icon size="20" :color="currentRoute === item.name ? '#ffffff' : '#9ca3af'">
            <component :is="item.icon" />
          </n-icon>
        </div>
      </div>
    </div>

    <!-- 右侧内容区域 -->
    <div class="main-content-wrapper">
      <div class="main-content-header">
        <div class="main-content-header__left">
          <template v-if="route.path.includes('site')">
            <div class="wb-site" @click="onBack">
              <n-icon :component="CaretLeft16Filled" size="16" />
            </div>
            <div class="wb-site" @click="onForward">
              <n-icon :component="CaretRight16Filled" size="16" />
            </div>
            <div class="wb-site" @click="onRefresh">
              <n-icon :component="ArrowClockwise16Filled" size="12" />
            </div>
            <div style="width: 20px"></div>
            <div class="wb-max" v-if="canDownload" @click="onDownload">
              <n-icon :component="ArrowDownload16Filled" size="12" />
            </div>
            <div
              class="wb-site"
              v-if="canAttention"
              @click="onAddSpecialAttention"
              title="特别关注"
            >
              <n-icon :component="Star24Regular" size="12" />
            </div>
            <div class="wb-site" v-if="isDev" @click="onDebug">
              <n-icon :component="WindowConsole20Regular" size="12" />
            </div>
          </template>
          <!-- 队列入口 -->
          <div
            @click="onOpenQueue"
            class="queue-entry-wrapper"
            :class="{ 'queue-entry-wrapper--active': totalCount > 0 }"
          >
            <div class="wb-site queue-entry" :class="{ breathing: hasActiveDownloads }">
              <n-icon :component="Cart16Filled" size="12" />
            </div>
            <span v-if="totalCount > 0" class="queue-count"
              ><span class="queue-count-simple">{{ completedCount }} / {{ totalCount }}</span
              ><span class="queue-count-full"
                >队列中：{{ pendingCount }}，已完成：{{ completedCount }}，总任务：{{
                  totalCount
                }}</span
              ></span
            >
          </div>
        </div>
        <div class="main-content-header__right">
          <div class="wb-min" @click="onMin">
            <n-icon :component="MinusOutlined" size="12" />
          </div>
          <div v-if="isScreenFull" class="wb-unmax" @click="onUnMax">
            <n-icon :component="ArrowMinimize16Filled" size="12" />
          </div>
          <div v-else class="wb-max" @click="onMax">
            <n-icon :component="ArrowMaximize16Filled" size="12" />
          </div>
          <div class="wb-close" @click="onClose">
            <n-icon :component="CloseOutlined" size="12" />
          </div>
        </div>
      </div>
      <div class="main-content">
        <!-- 下载队列面板 -->
        <DownloadQueuePanel v-model:show="queueVisible" />
        <router-view v-slot="{ Component }">
          <keep-alive include="book,jmtt,pixiv,twitter,special-attention">
            <component ref="childComponentRef" :is="Component" />
          </keep-alive>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon } from 'naive-ui'
import { SettingsSharp } from '@vicons/ionicons5'
import {
  VideoClipMultiple24Regular,
  Book24Regular,
  AirplaneTakeOff16Regular,
  ArrowMaximize16Filled,
  ArrowMinimize16Filled,
  CaretLeft16Filled,
  CaretRight16Filled,
  ArrowClockwise16Filled,
  ArrowDownload16Filled,
  WindowConsole20Regular,
  Cart16Filled,
  Star24Regular,
  PeopleTeam24Regular
} from '@vicons/fluent'
import { CloseOutlined, MinusOutlined } from '@vicons/antd'
import jmttImg from '@renderer/assets/jmtt.jpg'
import pixivImg from '@renderer/assets/pixiv.jpg'
import twitterImg from '@renderer/assets/twitter.jpg'
import DownloadQueuePanel from '@renderer/components/download-queue-panel.vue'
import { queue } from '@renderer/plugins/store/downloadQueue'
import twitter from '../views/special-attention/twitter'
const route = useRoute()
const router = useRouter()
const currentRoute = computed(() => route.name)
const childComponentRef = ref()
const canDownload = computed(
  () => !!(childComponentRef.value && (childComponentRef.value as any).canDownload)
)
const canAttention = computed(
  () => !!(childComponentRef.value && (childComponentRef.value as any).canAttention)
)
const isDev = import.meta.env.DEV
const hasActiveDownloads = computed(() => {
  return queue.tasks.some((t: any) => t.status === 'running' || t.status === 'pending')
})
const totalCount = computed(() => queue.tasks.length || 0)
const completedCount = computed(
  () => queue.tasks.filter((t: any) => ['success', 'existed'].includes(t.status)).length || 0
)
const pendingCount = computed(
  () => queue.tasks.filter((t: any) => t.status === 'pending').length || 0
)
// 菜单项配置
const menuItems = [
  { icon: Book24Regular, name: 'book' },
  { icon: VideoClipMultiple24Regular, name: 'video' },
  { icon: PeopleTeam24Regular, name: 'special-attention' }
  // { image: jmttImg, name: 'jmtt' },
  // { image: pixivImg, name: 'pixiv' },
  // { image: twitterImg, name: 'twitter' }
]

const bottomMenuItems = [{ icon: SettingsSharp, name: 'setting' }]

// 事件处理
function handleMenuClick(index: number, name: string) {
  router.push({ name })
}
function onDownload() {
  childComponentRef.value?.download()
}
function onAddSpecialAttention() {
  ;(childComponentRef.value as any)?.addSpecialAttention?.()
}
function onBack() {
  const webview = document.querySelector('webview')
  webview?.goBack()
}
function onForward() {
  const webview = document.querySelector('webview')
  webview?.goForward()
}
function onRefresh() {
  const webview = document.querySelector('webview')
  webview?.reload()
}
function onDebug() {
  const webview = document.querySelector('webview')
  webview?.openDevTools()
}
const queueVisible = ref(false)
function onOpenQueue() {
  queueVisible.value = !queueVisible.value
}
function onMin() {
  window.electron.ipcRenderer.invoke('window-min')
}
function onMax() {
  window.electron.ipcRenderer.invoke('window-max')
  isScreenFull.value = true
}
function onUnMax() {
  window.electron.ipcRenderer.invoke('window-unmax')
  isScreenFull.value = false
}
function onClose() {
  window.electron.ipcRenderer.invoke('window-close')
}
const isScreenFull = ref(false)
onMounted(async () => {
  // 渲染进程加载完成后，主动发起请求获取窗口大小
  isScreenFull.value = window.electron.ipcRenderer.send('get-window-size')
})
</script>

<style lang="scss" scoped>
$background-color: #322f3b;
.layout-container {
  display: flex;
  height: 100vh;
  background: #f5f5f5;
  border-radius: 24px;
  // overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.sidebar {
  min-width: 80px;
  max-width: 80px;
  background: $background-color;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 13px 0;
  border-radius: 24px 0 0 24px;
  position: relative;

  .logo-section {
    margin-bottom: 40px;

    .logo-icon {
      width: 48px;
      height: 48px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 48px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

      &:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
      }

      &:active {
        transform: translateY(0);
      }
    }
  }

  .nav-menu {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .bottom-menu {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: auto;
  }

  .menu-item {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: transparent;

    &::before {
      content: '';
      position: absolute;
      left: -10px;
      top: 50%;
      transform: translateY(-50%);
      width: 4px;
      height: 0;
      background: #ffffff;
      border-radius: 0 2px 2px 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateX(4px);

      &::before {
        height: 20px;
      }
    }

    &.active {
      background: rgba(255, 255, 255, 0.15);
      transform: translateX(4px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);

      &::before {
        height: 32px;
        background: #60a5fa;
      }
    }

    &:active {
      transform: translateX(2px) scale(0.95);
    }

    // 添加涟漪效果
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition: all 0.3s ease;
    }

    &:active::after {
      width: 48px;
      height: 48px;
    }
  }
}

.main-content-wrapper {
  flex: 1;
  background: $background-color;
  border-radius: 0 24px 24px 0;
  // overflow: hidden;
  position: relative;
  padding: 0px 6px 35px 0px;
  overflow: hidden;
  .main-content-header {
    width: 100%;
    height: 30px;
    padding-left: 20px;
    padding-right: 10px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    -webkit-app-region: drag;
    [class*='wb-'] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
      border-radius: 10px;
      -webkit-app-region: no-drag !important;
      transition-duration: 0.3s;
      i {
        opacity: 0;
        color: #1f1f1f;
        transition-duration: 0.3s;
      }
      &:hover {
        scale: 1.1;
        transition-duration: 0.3s;
      }
    }
    .wb-site {
      background: #ccc;
    }
    .queue-entry-wrapper {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      -webkit-app-region: no-drag !important;
      cursor: pointer;
      &--active {
        background: #fff;
        border-radius: 10px;
        padding: 2px;
      }
      /* 悬浮：显示详细，隐藏简略 */
      &:hover {
        .queue-count-simple {
          opacity: 0;
          max-width: 0; /* 收起 */
        }
        .queue-count-full {
          opacity: 1;
          max-width: 400px; /* 依据你的文案长度调大/调小 */
        }
      }
    }
    .queue-count {
      font-size: 10px;
      color: #1f1f1f;
      user-select: none;
      line-height: 1;
      padding: 0 5px;
      white-space: nowrap; /* 防止换行抖动 */
    }
    .queue-count-simple,
    .queue-count-full {
      display: inline-block;
      transition:
        opacity 200ms ease,
        max-width 200ms ease;
      will-change: opacity, transform, max-width;
      white-space: nowrap;
    }

    /* 默认：仅显示简略 */
    .queue-count-simple {
      opacity: 1;
      max-width: 100px; /* 收起 */
    }
    .queue-count-full {
      opacity: 0;
      max-width: 0; /* 收起 */
    }
    .wb-site.breathing {
      background: #57dc04;
      animation: breatheGlow 1s ease-in-out infinite;
      box-shadow: 0 0 8px rgba(96, 165, 250, 0.6);
    }
    .wb-min {
      background: #ff9205;
    }
    .wb-unmax,
    .wb-max {
      background: #57dc04;
    }
    .wb-close {
      background: #f20808;
    }
    &__left {
      i {
        opacity: 1 !important;
      }
    }
    &__left,
    &__right {
      display: flex;
      align-items: center;
      gap: 12px;
      &:hover {
        i {
          opacity: 1;
          transition-duration: 0.3s;
        }
      }
    }
  }
  .main-content {
    width: 100%;
    height: 100%;
    border-radius: 20px;
    // overflow: hidden;
    background: #fff;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100'  fill='white'/%3E%3C/svg%3E");
    mask-size: 100%;
  }
}

// 响应式设计
@media (max-width: 768px) {
  .layout-container {
    margin: 8px;
    border-radius: 16px;
  }

  .sidebar {
    width: 64px;
    padding: 16px 0;
    border-radius: 16px 0 0 16px;

    .logo-section {
      margin-bottom: 24px;

      .logo-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
      }
    }

    .menu-item {
      width: 40px;
      height: 40px;
      border-radius: 10px;
    }
  }

  .main-content-wrapper {
    border-radius: 0 16px 16px 0;
  }
}

// 深色模式支持
@media (prefers-color-scheme: dark) {
  .layout-container {
    background: #1a1a1a;
  }

  .sidebar {
    background: #111827;
  }

  .main-content-wrapper {
    background: #1f2937;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 菜单项的延迟动画
.menu-item {
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: both;

  @for $i from 1 through 6 {
    &:nth-child(#{$i}) {
      animation-delay: #{$i * 0.1}s;
    }
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes breatheGlow {
  0% {
    box-shadow: 0 0 0 rgba(96, 165, 250, 0);
    transform: scale(0.8);
  }
  50% {
    box-shadow: 0 0 12px #57dc04;
    transform: scale(1.1);
  }
  100% {
    box-shadow: 0 0 0 rgba(96, 165, 250, 0);
    transform: scale(0.8);
  }
}
</style>
<style lang="scss">
/* 适用于WebKit内核的浏览器 (Chrome, Safari, Edge) */
::-webkit-scrollbar {
  width: 8px; /* 垂直滚动条的宽度 */
  height: 8px; /* 水平滚动条的高度 */
}

::-webkit-scrollbar-track {
  background: #f1f1f1; /* 轨道颜色 */
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1; /* 滑块颜色 */
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8; /* 滑块悬停颜色 */
}
</style>

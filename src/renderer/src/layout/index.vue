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
          :class="{ active: activeIndex === index }"
          @click="handleMenuClick(index, item.name)"
        >
          <n-icon size="25" :color="activeIndex === index ? '#ffffff' : '#9ca3af'">
            <component :is="item.icon" />
          </n-icon>
        </div>
      </div>

      <!-- 底部菜单 -->
      <div class="bottom-menu">
        <div
          v-for="(item, index) in bottomMenuItems"
          :key="index"
          class="menu-item"
          :class="{ active: activeBottomIndex === index }"
          @click="handleBottomMenuClick(index, item.name)"
        >
          <n-icon size="20" :color="activeBottomIndex === index ? '#ffffff' : '#9ca3af'">
            <component :is="item.icon" />
          </n-icon>
        </div>
      </div>
    </div>

    <!-- 右侧内容区域 -->
    <div class="main-content-wrapper">
      <div class="main-content-header">
        <div class="wb-min" @click="onMin" />
        <div v-if="isScreenFull" class="wb-unmax" @click="onUnMax" />
        <div v-else class="wb-max" @click="onMax" />
        <div class="wb-close" @click="onClose" />
      </div>
      <div class="main-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import {
  Book,
  DocumentTextOutline,
  BarChartOutline,
  CubeOutline,
  SettingsSharp,
  BookmarkOutline
} from '@vicons/ionicons5'
import { VideoClipMultiple24Regular, Book24Regular } from '@vicons/fluent'
// 菜单项配置
const menuItems = [
  { icon: Book24Regular, name: 'book' },
  { icon: VideoClipMultiple24Regular, name: 'video' }
]

const bottomMenuItems = [{ icon: SettingsSharp, name: 'setting' }]

// 响应式状态
const activeIndex = ref(0)
const activeBottomIndex = ref(-1)

// 事件处理
const handleMenuClick = (index: number, name: string) => {
  activeIndex.value = index
  activeBottomIndex.value = -1
}

const handleBottomMenuClick = (index: number, name: string) => {
  activeBottomIndex.value = index
  activeIndex.value = -1
  if (name === 'setting') {
    console.log('🚀 ~ handleBottomMenuClick ~ name:', name)
  }
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
onMounted(() => {
  // 渲染进程加载完成后，主动发起请求获取窗口大小
  isScreenFull.value = window.electron.ipcRenderer.send('get-window-size')
  // 主进程ready时发送的通信，渲染进程无法获取到，需要上面主动发送
  // window.electron.ipcRenderer.on('main-window-max', (event) => {
  //   isScreenFull.value = true
  // })
  // window.electron.ipcRenderer.on('main-window-unmax', (event) => {
  //   isScreenFull.value = false
  // })
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
  padding: 30px 6px 6px 0px;

  .main-content-header {
    display: flex;
    align-items: center;
    margin-right: 13px;
    gap: 4px;
    float: right;
    position: absolute;
    top: 2px;
    right: 0px;
    [class*='wb-'] {
      width: 26px;
      height: 26px;
      cursor: pointer;
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
      z-index: 999999;
    }
    .wb-min {
      background-image: url('@renderer/assets/win-btn-min-normal.svg');
    }
    .wb-unmax,
    .wb-max {
      background-image: url('@renderer/assets/win-btn-max-normal.svg');
    }
    .wb-close {
      background-image: url('@renderer/assets/win-btn-close-normal.svg');
    }

    &:hover {
      .wb-min {
        background-image: url('@renderer/assets/win-btn-min-hover.svg');
        transition: background-image 0.3s ease;
      }
      .wb-max {
        background-image: url('@renderer/assets/win-btn-max-hover.svg');
        transition: background-image 0.3s ease;
      }
      .wb-unmax {
        background-image: url('@renderer/assets/win-btn-max-full.svg');
        transition: background-image 0.3s ease;
      }
      .wb-close {
        background-image: url('@renderer/assets/win-btn-close-hover.svg');
        transition: background-image 0.3s ease;
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
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      width: calc(100% - 100px);
      height: 30px;
      -webkit-app-region: drag;
    }
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

<template>
  <div class="layout-container">
    <div class="main-content-wrapper">
      <div class="main-content-header">
        <div />
        <div class="main-content-header__right">
          <!-- <div class="wb-min" @click="onMin">
            <n-icon :component="MinusOutlined" size="12" />
          </div>
          <div v-if="isScreenFull" class="wb-unmax" @click="onUnMax">
            <n-icon :component="ArrowMinimize16Filled" size="12" />
          </div>
          <div v-else class="wb-max" @click="onMax">
            <n-icon :component="ArrowMaximize16Filled" size="12" />
          </div> -->
          <div class="wb-close" @click="onClose">
            <n-icon :component="CloseOutlined" size="12" />
          </div>
        </div>
      </div>
      <div class="main-content">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component ref="childComponentRef" :is="Component" />
          </keep-alive>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NIcon } from 'naive-ui'
import { ArrowMaximize16Filled, ArrowMinimize16Filled } from '@vicons/fluent'
import { CloseOutlined, MinusOutlined } from '@vicons/antd'

const childComponentRef = ref()
const isScreenFull = ref(false)

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
  window.electron.ipcRenderer.invoke('popup-close')
}
</script>

<style lang="scss" scoped>
$background-color: #322f3b;
.layout-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #f5f5f5;
  // border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.main-content-wrapper {
  flex: 1;
  background: $background-color;
  // border-radius: 20px;
  position: relative;
  padding: 0px 6px 6px 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

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
    background: #fff;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100'  fill='white'/%3E%3C/svg%3E");
    mask-size: 100%;
  }
}
</style>
<style lang="scss">
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>

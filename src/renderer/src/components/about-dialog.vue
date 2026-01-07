<template>
  <n-modal
    :show="showModal"
    @update:show="(value) => (showModal = value)"
    :mask-closable="false"
    preset="dialog"
    :title="title"
    style="width: 500px"
  >
    <div class="about-content">
      <div class="app-info">
        <div class="app-icon">
          <img src="@renderer/assets/icon.png" alt="App Icon" />
        </div>
        <div class="app-details">
          <h3>{{ appName }}</h3>
          <p class="version">版本 v{{ version }}</p>
        </div>
      </div>

      <!-- 更新信息区域 -->
      <div v-if="updateInfo.available" class="update-info-section">
        <n-alert type="info" :title="`发现新版本 v${updateInfo.version}`" show-icon>
          <div class="release-notes" v-html="updateInfo.releaseNotes" />
        </n-alert>
        <div class="update-actions">
          <!-- 带进度条的下载按钮 -->
          <div class="download-button-container">
            <n-button
              type="primary"
              :loading="updateInfo.downloading"
              @click="downloadUpdate"
              block
              :disabled="updateInfo.downloading"
            >
              {{ updateInfo.downloading ? `下载中 ${updateInfo.downloadProgress}%` : '下载并安装' }}
            </n-button>
          </div>
          <n-button
            type="default"
            @click="ignoreVersion"
            block
            style="margin-top: 8px"
            :disabled="updateInfo.downloading"
          >
            忽略此版本
          </n-button>
        </div>
      </div>

      <!-- 更新下载完成区域 -->
      <div v-if="updateInfo.downloaded" class="update-ready-section">
        <n-alert type="success" title="更新已下载" show-icon>
          更新已下载完成，是否立即重启安装？
        </n-alert>
        <div class="update-actions">
          <n-button type="primary" @click="installUpdate" block> 立即重启 </n-button>
          <n-button
            type="default"
            @click="updateInfo.downloaded = false"
            block
            style="margin-top: 8px"
          >
            稍后
          </n-button>
        </div>
      </div>

      <!-- 检查更新按钮 -->
      <div v-if="!updateInfo.available && !updateInfo.downloaded" class="update-section">
        <n-button type="primary" :loading="checkingUpdate" @click="checkForUpdate" block>
          {{ checkingUpdate ? '检查中...' : '检查更新' }}
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NModal, NButton, NAlert, NProgress } from 'naive-ui'

export default {
  components: {
    NModal,
    NButton,
    NAlert,
    NProgress
  },
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  setup(props, { emit }) {
    const showModal = ref(props.show)
    const title = ref('关于')
    const appName = ref('漫画阅读器')
    const version = ref('1.0.0')
    const checkingUpdate = ref(false)

    // 更新信息
    const updateInfo = ref({
      available: false,
      version: '',
      releaseNotes: '',
      downloading: false,
      downloaded: false,
      downloadProgress: 0
    })
    // 监听props变化
    watch(
      () => props.show,
      (newVal) => {
        showModal.value = newVal
      }
    )

    // 监听内部状态变化
    watch(showModal, (newVal) => {
      emit('update:show', newVal)
    })
    // 获取应用版本信息
    watch(
      () => props.show,
      async (newVal) => {
        if (newVal) {
          try {
            const appVersion = await (window as any).electron.ipcRenderer.invoke('app:getVersion')
            if (appVersion) {
              version.value = appVersion
            }
          } catch (error) {
            console.error('获取版本信息失败:', error)
          }
        }
      },
      { immediate: true }
    )

    // 检查更新
    const checkForUpdate = async () => {
      checkingUpdate.value = true
      try {
        await (window as any).electron.ipcRenderer.invoke('update:check')
      } catch (error) {
        console.error('检查更新失败:', error)
      } finally {
        checkingUpdate.value = false
      }
    }

    // 下载更新
    const downloadUpdate = async () => {
      updateInfo.value.downloading = true
      try {
        await (window as any).electron.ipcRenderer.invoke('update:download')
      } catch (error) {
        console.error('下载更新失败:', error)
        updateInfo.value.downloading = false
      }
    }

    // 忽略版本
    const ignoreVersion = async () => {
      try {
        await (window as any).electron.ipcRenderer.invoke('update:ignore', updateInfo.value.version)
        updateInfo.value.available = false
        showModal.value = false
      } catch (error) {
        console.error('忽略版本失败:', error)
      }
    }

    // 安装更新
    const installUpdate = async () => {
      try {
        await (window as any).electron.ipcRenderer.invoke('update:install')
      } catch (error) {
        console.error('安装更新失败:', error)
      }
    }

    // 监听更新事件
    onMounted(() => {
      // 监听更新可用事件
      window.electron.ipcRenderer.on('update:available', (event, info) => {
        updateInfo.value.available = true
        updateInfo.value.version = info.version
        updateInfo.value.releaseNotes = info.releaseNotes || '暂无更新说明'
        showModal.value = true
      })

      // 监听下载进度事件
      window.electron.ipcRenderer.on('update:progress', (event, progress) => {
        updateInfo.value.downloadProgress = progress.percent.toFixed(2) * 1
      })

      // 监听下载完成事件
      window.electron.ipcRenderer.on('update:downloaded', () => {
        updateInfo.value.downloading = false
        updateInfo.value.downloaded = true
      })

      // 监听更新错误事件
      window.electron.ipcRenderer.on('update:error', (event, error) => {
        updateInfo.value.downloading = false
        console.error('更新错误:', error)
      })
    })

    return {
      showModal,
      title,
      appName,
      version,
      checkingUpdate,
      updateInfo,
      checkForUpdate,
      downloadUpdate,
      ignoreVersion,
      installUpdate
    }
  }
}
</script>

<style lang="scss">
.about-content {
  padding: 10px 0;

  .app-info {
    display: flex;
    align-items: center;
    margin-bottom: 20px;

    .app-icon {
      width: 64px;
      height: 64px;
      margin-right: 16px;

      img {
        width: 100%;
        height: 100%;
        border-radius: 12px;
      }
    }

    .app-details {
      h3 {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 600;
      }

      .version {
        margin: 0;
        color: #666;
        font-size: 14px;
      }
    }
  }

  .update-section {
    margin-bottom: 20px;
  }

  .update-info-section {
    margin-bottom: 20px;

    .release-notes {
      margin-top: 8px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 14px;
      p {
        margin-top: 10px;
      }
      li {
        line-height: 25px;
      }
    }
  }

  .update-ready-section {
    margin-bottom: 20px;
  }

  .download-button-container {
    position: relative;
    margin-bottom: 8px;

    .progress-bar-container {
      margin-top: 8px;
    }
  }

  .update-actions {
    margin-top: 16px;
  }
}
</style>

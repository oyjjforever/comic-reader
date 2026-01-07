<template>
  <n-modal
    :show="showModal"
    @update:show="(value) => (showModal = value)"
    :mask-closable="false"
    preset="dialog"
    :title="title"
    style="width: 400px"
  >
    <div class="about-content">
      <div class="app-info">
        <div class="app-icon">
          <img src="@renderer/assets/icon.png" alt="App Icon" />
        </div>
        <div class="app-details">
          <h3>{{ appName }}</h3>
          <p class="version">版本 {{ version }}</p>
        </div>
      </div>

      <div class="update-section">
        <n-button type="primary" :loading="checkingUpdate" @click="checkForUpdate" block>
          {{ checkingUpdate ? '检查中...' : '检查更新' }}
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script lang="ts">
import { ref, watch } from 'vue'
import { NModal, NButton } from 'naive-ui'

export default {
  components: {
    NModal,
    NButton
  },
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:show'],
  setup(props, { emit }) {
    const showModal = ref(props.show)
    const title = ref('关于')
    const appName = ref('漫画阅读器')
    const version = ref('1.0.0')
    const checkingUpdate = ref(false)

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

    return {
      showModal,
      title,
      appName,
      version,
      checkingUpdate,
      checkForUpdate
    }
  }
}
</script>

<style lang="scss" scoped>
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

  .app-description {
    p {
      margin: 0;
      color: #666;
      font-size: 14px;
      line-height: 1.5;
    }
  }
}
</style>

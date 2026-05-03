<template>
  <div class="setting">
    <n-tabs type="line" animated :value="activeTab" @update:value="(value) => (activeTab = value)">
      <!-- 通用设置 -->
      <n-tab-pane name="general" tab="通用设置">
        <GeneralSettings v-model="formData" />
      </n-tab-pane>

      <!-- 剪切板设置 -->
      <n-tab-pane name="clipboard" tab="剪切板设置">
        <ClipboardSettings v-model="formData" />
      </n-tab-pane>

      <!-- 路径设置 -->
      <n-tab-pane name="resource" tab="资源设置">
        <ResourceSettings v-model="formData" />
      </n-tab-pane>

      <!-- 下载设置 -->
      <n-tab-pane name="download" tab="下载设置">
        <DownloadSettings v-model="formData" />
      </n-tab-pane>

      <!-- 数据库设置 -->
      <n-tab-pane name="database" tab="备份还原">
        <DatabaseSettings v-model="formData" />
      </n-tab-pane>

      <!-- 局域网服务设置 -->
      <n-tab-pane name="lanService" tab="局域网服务">
        <LanServiceSettings v-model="formData" />
      </n-tab-pane>

      <!-- 字幕设置 -->
      <n-tab-pane name="subtitle" tab="字幕设置">
        <SubtitleSettings />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useSettingStore } from '../../plugins/store'
import { setting } from '../../../../typings/setting'
import GeneralSettings from './tabs/GeneralSettings.vue'
import ClipboardSettings from './tabs/ClipboardSettings.vue'
import ResourceSettings from './tabs/ResourceSettings.vue'
import DownloadSettings from './tabs/DownloadSettings.vue'
import DatabaseSettings from './tabs/DatabaseSettings.vue'
import LanServiceSettings from './tabs/LanServiceSettings.vue'
import SubtitleSettings from './tabs/SubtitleSettings.vue'

const settingStore = useSettingStore()
const message = useMessage()
const route = useRoute()

const formData = ref<setting>(settingStore.setting)
const activeTab = ref('general')

// 组件挂载时，更新设置状态
onMounted(async () => {
  await settingStore.updateSetting()
  formData.value = settingStore.setting

  // 根据路由参数设置默认标签页
  const tabFromQuery = route.query.tab as string
  if (
    tabFromQuery &&
    ['general', 'clipboard', 'resource', 'download', 'database', 'lanService', 'subtitle'].includes(
      tabFromQuery
    )
  ) {
    activeTab.value = tabFromQuery
  }

  watch(
    () => formData.value,
    (newValue: setting) => {
      settingStore.setSetting(newValue)
      message.success('设置成功')
    },
    { deep: true, immediate: false }
  )
})
</script>

<style lang="scss" scoped>
.setting {
  overflow: auto;
  padding: 20px;
  width: 100%;
  height: 100%;
}
</style>

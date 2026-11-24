<template>
  <n-config-provider
    class="setting-provider"
    :theme="isLight ? lightTheme : darkTheme"
    :theme-overrides="orangeOverrides"
  >
    <div class="setting">
      <div class="setting-panel">
        <n-tabs
          type="line"
          animated
          :value="activeTab"
          @update:value="(value) => (activeTab = value)"
        >
          <!-- 通用设置 -->
          <n-tab-pane name="general" tab="通用设置">
            <GeneralSettings v-model="formData" />
          </n-tab-pane>

          <!-- 阅读设置 -->
          <n-tab-pane name="reading" tab="阅读设置">
            <ReadingSettings v-model="formData" />
          </n-tab-pane>

          <!-- 剪切板设置 -->
          <n-tab-pane name="clipboard" tab="剪切板设置">
            <ClipboardSettings v-model="formData" />
          </n-tab-pane>

          <!-- 路径设置 -->
          <n-tab-pane name="resource" tab="资源设置">
            <ResourceSettings v-model="formData" />
          </n-tab-pane>

          <!-- 站点设置 -->
          <n-tab-pane name="site" tab="站点设置">
            <SiteSettings v-model="formData" />
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
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage, darkTheme, lightTheme, type GlobalThemeOverrides } from 'naive-ui'
import { useSettingStore } from '../../plugins/store'
import { setting } from '../../../../typings/setting'
import { useTheme } from '@renderer/composables/use-theme'
import GeneralSettings from './tabs/GeneralSettings.vue'
import ReadingSettings from './tabs/ReadingSettings.vue'
import ClipboardSettings from './tabs/ClipboardSettings.vue'
import ResourceSettings from './tabs/ResourceSettings.vue'
import SiteSettings from './tabs/SiteSettings.vue'
import DatabaseSettings from './tabs/DatabaseSettings.vue'
import LanServiceSettings from './tabs/LanServiceSettings.vue'
import SubtitleSettings from './tabs/SubtitleSettings.vue'

const settingStore = useSettingStore()
const message = useMessage()
const route = useRoute()
// 界面主题：浅色时整页 naive 组件换 lightTheme（根 provider 不随 uiTheme 变，见 App.vue）
const { isLight } = useTheme()

// 设置页整体 naive 组件换肤：n-config-provider 支持嵌套，内层对全部后代 naive
// 组件生效（含 Teleport 到 body 的下拉/浮层），免去逐组件 CSS 变量覆写；
// 主色覆盖为品牌橙（深浅两套相同），Tabs / Card 的文字与底色随界面主题取值
const orangeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: '#FF9205',
    primaryColorHover: '#FFA740',
    primaryColorPressed: '#E67E00',
    primaryColorSuppl: '#FF9205'
  },
  Tabs: {
    tabTextColorLine: isLight.value ? '#6F6A7D' : '#9D97AB',
    tabTextColorHoverLine: isLight.value ? '#26232F' : '#D9D4DE',
    tabTextColorActiveLine: isLight.value ? '#A85A00' : '#FFCA85',
    barColor: '#FF9205'
  },
  Card: {
    color: isLight.value ? 'rgba(50, 47, 59, 0.04)' : 'rgba(255, 255, 255, 0.06)',
    borderColor: isLight.value ? 'rgba(50, 47, 59, 0.1)' : 'rgba(255, 255, 255, 0.12)'
  }
}))

const formData = ref<setting>(settingStore.setting)
const activeTab = ref('general')

// 外部改动设置后同步表单引用（如侧栏的主题切换按钮）：formData 持有的是设置对象
// 本身，外部经 setSetting 换成新对象后若不同步，再改任一设置项会拿旧对象整体回写，
// 把外部改动（如 uiTheme）冲掉
watch(
  () => settingStore.setting,
  (value) => {
    formData.value = value
  }
)

// 组件挂载时，更新设置状态
onMounted(async () => {
  await settingStore.updateSetting()
  formData.value = settingStore.setting

  // 根据路由参数设置默认标签页
  const tabFromQuery = route.query.tab as string
  if (
    tabFromQuery &&
    [
      'general',
      'reading',
      'clipboard',
      'resource',
      'site',
      'database',
      'lanService',
      'subtitle'
    ].includes(tabFromQuery)
  ) {
    activeTab.value = tabFromQuery
  }

  watch(
    () => formData.value,
    (newValue: setting) => {
      // 外部改动引起的自同步（上方 watch 已把 formData 换成 store 当前对象）：
      // 该值已入库，不重复保存、不弹提示
      if (newValue === settingStore.setting) return
      settingStore.setSetting(newValue)
      message.success('设置成功')
    },
    { deep: true, immediate: false }
  )
})
</script>

<style lang="scss" scoped>
.setting-provider {
  height: 100%;
}

// 配色走界面主题令牌（styles/theme.css）：注释里的"暗色 / 黑橙"说的是深色下的样子，
// 浅色主题下自动翻转
// 页面画布：黑橙底 + 辉光 + 点阵（与书架 home-container 同款）。
// 面板固定满高不滚动，滚动收进激活的 tab-pane 内部
.setting {
  padding: 8px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--ui-canvas);
  background-image: radial-gradient(
      ellipse 85% 65% at 15% 8%,
      var(--ui-glow-a),
      transparent 60%
    ),
    radial-gradient(ellipse 75% 60% at 92% 96%, var(--ui-glow-b), transparent 62%),
    radial-gradient(circle, var(--ui-dot) 1px, transparent 1.6px);
  background-size:
    100% 100%,
    100% 100%,
    26px 26px;
  color: var(--ui-text);

  // 暗色滚动条：橙色胶囊滑块，槽完全透明（track-piece 一并置透明防默认底色）
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: var(--ui-scroll);
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--ui-scroll-ring);

    &:hover {
      background: var(--ui-scroll-hover);
    }
  }

  ::-webkit-scrollbar-track,
  ::-webkit-scrollbar-track-piece,
  ::-webkit-scrollbar-corner {
    background: transparent;
    border: none;
    box-shadow: none;
  }
}

// 设置面板：悬浮暗色毛玻璃（与书架侧栏同款），铺满内容区宽高；
// 内部 n-tabs 纵向 flex 撑满，滚动只发生在激活的 tab-pane 里
.setting-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  padding: 10px 24px 24px;
  background: rgba(var(--ui-panel-rgb), 0.75);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(var(--ui-overlay-rgb), 0.1);
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 var(--ui-panel-top-light-soft),
    var(--ui-panel-shadow);

  :deep(.n-tabs) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    /* 有 pane-wrapper 时先让它吃满剩余空间（无 wrapper 时此规则空匹配） */
    .n-tabs-pane-wrapper {
      flex: 1;
      min-height: 0;
    }

    .n-tab-pane {
      /* 无 wrapper：作为 n-tabs 的 flex 子项拉伸；有 wrapper：height 撑满 */
      flex: 1;
      min-height: 0;
      height: 100%;
      overflow-y: auto;
      padding-right: 8px; // 滚动条与表单留缝
    }
  }
}
</style>

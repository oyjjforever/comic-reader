<template>
  <n-form :model="modelValue">
    <!-- 站点显示设置 -->
    <n-form-item label="站点显示" :show-feedback="false">
      <div class="site-visibility">
        <div class="site-visibility__grid">
          <div v-for="site in siteList" :key="site.key" class="site-visibility__item">
            <img :src="site.image" width="20" height="20" />
            <span class="site-visibility__label">{{ site.label }}</span>
            <n-switch
              :value="!isHidden(site.key)"
              size="small"
              @update:value="(value) => toggleSite(site.key, value)"
            />
          </div>
        </div>
        <span class="site-visibility__tip">关闭后，站点将从左侧「站点」悬浮菜单中隐藏</span>
      </div>
    </n-form-item>

    <n-form-item path="defaultDownloadPath" label="默认下载路径">
      <n-input-group>
        <n-input
          :value="modelValue.defaultDownloadPath"
          @update:value="(value) => updateSetting('defaultDownloadPath', value)"
          placeholder="请选择默认下载文件夹路径"
          readonly
        />
        <n-button type="primary" @click="selectResourcePath('defaultDownloadPath')">
          选择文件夹
        </n-button>
      </n-input-group>
    </n-form-item>

    <div class="more-toggle">
      <n-button text type="primary" @click="showMore = !showMore">
        {{ showMore ? '收起更多下载路径' : '更多下载路径设置' }}
      </n-button>
    </div>
    <div v-if="showMore">
      <n-form-item
        v-for="field in visibleDownloadPathFields"
        :key="field.key"
        :path="field.key"
        :label="field.label"
      >
        <n-input-group>
          <n-input
            :value="(modelValue as any)[field.key]"
            @update:value="(value) => updateSetting(field.key, value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath(field.key)"> 选择文件夹 </n-button>
        </n-input-group>
      </n-form-item>
    </div>
  </n-form>
</template>

<script setup lang="ts">
import { ref, computed, defineProps, defineEmits } from 'vue'
import { useMessage } from 'naive-ui'
import { setting } from '../../../../../typings/setting'
import { isSiteAllowed, loadSiteWhitelist } from '@renderer/plugins/store/siteWhitelist'
import jmttImg from '@renderer/assets/jmtt.jpg'
import pixivImg from '@renderer/assets/pixiv.jpg'
import twitterImg from '@renderer/assets/twitter.jpg'
import weiboImg from '@renderer/assets/weibo.ico'
import picamanImg from '@renderer/assets/picaman.ico'
import pornhubImg from '@renderer/assets/pornhub.ico'
import fourkhdImg from '@renderer/assets/4khd.png'
import huangguoImg from '@renderer/assets/huangguo.png'
import fanqieImg from '@renderer/assets/fanqie.png'
import missavImg from '@renderer/assets/missav.png'

const props = defineProps<{
  modelValue: setting
}>()

const emit = defineEmits(['update:modelValue'])

const message = useMessage()
const showMore = ref(false)

// 站点列表（与左侧「站点」悬浮菜单保持一致，key 对应路由/站点标识）；
// 部署白名单限制时仅静默列出允许的站点（对用户透明，无任何限制提示）
const allSites = [
  { image: missavImg, key: 'missav', label: 'MISSAV' },
  { image: fourkhdImg, key: '4khd', label: '4KHD' },
  { image: fanqieImg, key: 'fanqie', label: '番茄短剧' },
  { image: jmttImg, key: 'jmtt', label: 'JMTT' },
  { image: pixivImg, key: 'pixiv', label: 'Pixiv' },
  { image: twitterImg, key: 'twitter', label: 'Twitter' },
  { image: weiboImg, key: 'weibo', label: '微博' },
  { image: picamanImg, key: 'picaman', label: 'Picaman' },
  { image: huangguoImg, key: 'huangguo', label: '黄果剧场' },
  { image: pornhubImg, key: 'pornhub', label: 'Pornhub' }
]
void loadSiteWhitelist()
const siteList = computed(() => allSites.filter((s) => isSiteAllowed(s.key)))

// 各站点独立下载路径（「更多下载路径设置」区）：白名单外的站点连同路径表单一并隐藏（对用户透明）
const downloadPathFields: Array<{ key: keyof setting; site: string; label: string }> = [
  { key: 'downloadPathJmtt', site: 'jmtt', label: 'jmtt 下载路径' },
  { key: 'downloadPathPixiv', site: 'pixiv', label: 'pixiv 下载路径' },
  { key: 'downloadPathTwitter', site: 'twitter', label: 'twitter 下载路径' },
  { key: 'downloadPathWeibo', site: 'weibo', label: '微博 下载路径' },
  { key: 'downloadPathPicaman', site: 'picaman', label: 'Picaman 下载路径' },
  { key: 'downloadPathHuangguo', site: 'huangguo', label: '黄果 下载路径' },
  { key: 'downloadPath4khd', site: '4khd', label: '4KHD 下载路径' },
  { key: 'downloadPathPornhub', site: 'pornhub', label: 'Pornhub 下载路径' }
]
const visibleDownloadPathFields = computed(() =>
  downloadPathFields.filter((f) => isSiteAllowed(f.site))
)

const isHidden = (key: string) => {
  return (props.modelValue.hiddenSites || []).includes(key)
}

const toggleSite = (key: string, visible: boolean) => {
  const hidden = new Set(props.modelValue.hiddenSites || [])
  if (visible) {
    hidden.delete(key)
  } else {
    hidden.add(key)
  }
  updateSetting('hiddenSites', [...hidden])
}

const updateSetting = (key: keyof setting, value: any) => {
  const newSetting = { ...props.modelValue }
  newSetting[key] = value
  emit('update:modelValue', newSetting)
}

// 选择资源路径
const selectResourcePath = async (key: keyof setting) => {
  try {
    // 调用 Electron 的文件选择器
    const result = await window.electron.ipcRenderer.invoke('dialog:openDirectory')
    if (result && !result.canceled && result.filePaths.length > 0) {
      updateSetting(key, result.filePaths[0])
    }
  } catch (error) {
    message.error('选择文件夹失败')
  }
}
</script>

<style lang="scss" scoped>
.more-toggle {
  margin: 10px 0;
}

.site-visibility {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  .site-visibility__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 24px;
    width: 100%;
  }

  .site-visibility__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 150px;
  }

  .site-visibility__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.site-visibility__tip {
  font-size: 12px;
  color: #999;
}
</style>

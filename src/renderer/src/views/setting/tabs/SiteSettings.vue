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
      <n-form-item path="downloadPathJmtt" label="jmtt 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathJmtt"
            @update:value="(value) => updateSetting('downloadPathJmtt', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathJmtt')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPathPixiv" label="pixiv 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathPixiv"
            @update:value="(value) => updateSetting('downloadPathPixiv', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathPixiv')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPathTwitter" label="twitter 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathTwitter"
            @update:value="(value) => updateSetting('downloadPathTwitter', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathTwitter')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPathWeibo" label="微博 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathWeibo"
            @update:value="(value) => updateSetting('downloadPathWeibo', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathWeibo')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPathPicaman" label="Picaman 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathPicaman"
            @update:value="(value) => updateSetting('downloadPathPicaman', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathPicaman')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPathHuangguo" label="黄果 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathHuangguo"
            @update:value="(value) => updateSetting('downloadPathHuangguo', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathHuangguo')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPath4khd" label="4KHD 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPath4khd"
            @update:value="(value) => updateSetting('downloadPath4khd', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPath4khd')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
      <n-form-item path="downloadPathPornhub" label="Pornhub 下载路径">
        <n-input-group>
          <n-input
            :value="modelValue.downloadPathPornhub"
            @update:value="(value) => updateSetting('downloadPathPornhub', value)"
            placeholder="可选，未设置则使用默认下载路径"
            readonly
          />
          <n-button type="primary" @click="selectResourcePath('downloadPathPornhub')">
            选择文件夹
          </n-button>
        </n-input-group>
      </n-form-item>
    </div>
  </n-form>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits } from 'vue'
import { useMessage } from 'naive-ui'
import { setting } from '../../../../../typings/setting'
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

// 站点列表（与左侧「站点」悬浮菜单保持一致，key 对应路由/站点标识）
const siteList = [
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

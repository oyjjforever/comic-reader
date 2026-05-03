<template>
  <div class="subtitle-settings">
    <n-h3>字幕设置</n-h3>

    <!-- 依赖组件 -->
    <n-card title="依赖组件" size="small" style="margin-bottom: 16px">
      <n-space vertical>
        <n-alert
          v-if="!binaryStatus.whisperInstalled || !binaryStatus.ffmpegInstalled"
          type="warning"
          title="缺少必要组件"
        >
          请下载以下组件以启用字幕功能
        </n-alert>

        <div class="binary-item">
          <div class="binary-info">
            <span class="binary-name">Whisper.cpp</span>
            <n-tag v-if="binaryStatus.whisperInstalled" type="success" size="small">已安装</n-tag>
            <n-tag v-else type="warning" size="small">未安装</n-tag>
            <span v-if="whisperDownloadStatus" style="color: #999; font-size: 12px">
              {{
                whisperDownloadStatus === 'downloading'
                  ? `下载中 ${whisperDownloadProgress}%`
                  : whisperDownloadStatus === 'extracting'
                    ? '解压中...'
                    : '完成'
              }}
            </span>
          </div>
          <div class="binary-actions">
            <n-button
              v-if="!binaryStatus.whisperInstalled"
              size="small"
              type="primary"
              :loading="downloadingBinary === 'whisper'"
              @click="onDownloadBinary('whisper')"
            >
              自动下载
            </n-button>
            <n-progress
              v-if="downloadingBinary === 'whisper' && whisperDownloadStatus === 'downloading'"
              type="line"
              :percentage="whisperDownloadProgress"
              :show-indicator="false"
              status="info"
              style="width: 120px"
            />
          </div>
        </div>

        <div class="binary-item">
          <div class="binary-info">
            <span class="binary-name">FFmpeg</span>
            <n-tag v-if="binaryStatus.ffmpegInstalled" type="success" size="small">已安装</n-tag>
            <n-tag v-else type="warning" size="small">未安装</n-tag>
            <span v-if="ffmpegDownloadStatus" style="color: #999; font-size: 12px">
              {{
                ffmpegDownloadStatus === 'downloading'
                  ? `下载中 ${ffmpegDownloadProgress}%`
                  : ffmpegDownloadStatus === 'extracting'
                    ? '解压中...'
                    : '完成'
              }}
            </span>
          </div>
          <div class="binary-actions">
            <n-button
              v-if="!binaryStatus.ffmpegInstalled"
              size="small"
              type="primary"
              :loading="downloadingBinary === 'ffmpeg'"
              @click="onDownloadBinary('ffmpeg')"
            >
              自动下载
            </n-button>
            <n-progress
              v-if="downloadingBinary === 'ffmpeg' && ffmpegDownloadStatus === 'downloading'"
              type="line"
              :percentage="ffmpegDownloadProgress"
              :show-indicator="false"
              status="info"
              style="width: 120px"
            />
          </div>
        </div>
      </n-space>
    </n-card>

    <!-- 模型管理 -->
    <n-card title="Whisper 模型管理" size="small" style="margin-bottom: 16px">
      <n-space vertical>
        <n-alert v-if="!hasAnyModel" type="warning" title="未检测到模型">
          请先下载至少一个 Whisper 模型才能使用字幕功能
        </n-alert>

        <div v-for="model in models" :key="model.name" class="model-item">
          <div class="model-info">
            <span class="model-name">{{ model.displayName }}</span>
            <n-tag v-if="model.downloaded" type="success" size="small">已下载</n-tag>
            <n-tag v-else type="default" size="small">未下载</n-tag>
          </div>

          <div class="model-actions">
            <n-button
              v-if="!model.downloaded"
              size="small"
              type="primary"
              :loading="downloadingModel === model.name"
              @click="onDownloadModel(model.name)"
            >
              下载
            </n-button>

            <n-progress
              v-if="downloadingModel === model.name"
              type="line"
              :percentage="downloadProgress"
              :show-indicator="true"
              status="info"
              style="width: 120px"
            />

            <n-button
              v-if="model.downloaded"
              size="small"
              type="error"
              quaternary
              @click="onDeleteModel(model.name)"
            >
              删除
            </n-button>
          </div>
        </div>
      </n-space>
    </n-card>

    <!-- 字幕设置 -->
    <n-card title="字幕偏好" size="small" style="margin-bottom: 16px">
      <n-form label-placement="left" label-width="100">
        <n-form-item label="默认语言">
          <n-select
            v-model:value="settings.defaultLanguage"
            :options="languageOptions"
            style="width: 200px"
          />
        </n-form-item>

        <n-form-item label="默认模型">
          <n-select
            v-model:value="settings.defaultModel"
            :options="availableModelOptions"
            style="width: 200px"
          />
        </n-form-item>

        <n-form-item label="GPU 加速">
          <n-switch v-model:value="settings.useGpu" />
        </n-form-item>

        <n-form-item label="自动生成">
          <n-switch v-model:value="settings.autoGenerate" />
          <span style="margin-left: 8px; color: #999">打开视频时自动生成字幕</span>
        </n-form-item>

        <n-form-item label="字体大小">
          <n-slider
            v-model:value="settings.fontSize"
            :min="14"
            :max="48"
            :step="2"
            style="width: 200px"
          />
          <span style="margin-left: 8px">{{ settings.fontSize }}px</span>
        </n-form-item>

        <n-form-item label="字幕位置">
          <n-radio-group v-model:value="settings.subtitlePosition">
            <n-radio-button value="bottom">底部</n-radio-button>
            <n-radio-button value="top">顶部</n-radio-button>
          </n-radio-group>
        </n-form-item>

        <n-form-item label="背景透明度">
          <n-slider
            v-model:value="settings.opacity"
            :min="0.3"
            :max="1"
            :step="0.1"
            style="width: 200px"
          />
        </n-form-item>
      </n-form>
    </n-card>

    <!-- 数据存储 -->
    <n-card title="数据存储" size="small" style="margin-bottom: 16px">
      <n-space vertical>
        <n-form label-placement="left" label-width="100">
          <n-form-item label="存储位置">
            <n-space align="center" style="width: 100%">
              <n-input
                :value="settings.subtitleDataPath || '默认（C盘 AppData）'"
                disabled
                style="flex: 1"
              />
              <n-button size="small" @click="onSelectDataDir">选择目录</n-button>
              <n-button size="small" quaternary @click="onResetDataDir">重置默认</n-button>
            </n-space>
          </n-form-item>
          <n-form-item label="占用空间">
            <n-space align="center">
              <span>{{ dataInfo.dataSizeFormatted || '计算中...' }}</span>
              <n-button size="small" quaternary @click="loadDataInfo">刷新</n-button>
            </n-space>
          </n-form-item>
        </n-form>
        <n-alert v-if="settings.subtitleDataPath" type="info" title="自定义存储路径">
          模型文件、字幕缓存和临时音频将保存到：{{ settings.subtitleDataPath }}
        </n-alert>
      </n-space>
    </n-card>

    <!-- 缓存管理 -->
    <n-card title="缓存管理" size="small">
      <n-space>
        <n-button @click="onClearCache" type="warning">清除字幕缓存</n-button>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import type { ModelInfo, WhisperModelName, SubtitleSettings } from '@/typings/subtitle'
import { DEFAULT_SUBTITLE_SETTINGS } from '@/typings/subtitle'

const message = useMessage()

// 模型列表
const models = ref<ModelInfo[]>([])
const downloadingModel = ref<string | null>(null)
const downloadProgress = ref(0)

// 数据信息
const dataInfo = ref<{ dataDir: string; dataSize: number; dataSizeFormatted: string }>({
  dataDir: '',
  dataSize: 0,
  dataSizeFormatted: '0 B'
})

// 二进制文件状态
const binaryStatus = ref<{
  whisperInstalled: boolean
  ffmpegInstalled: boolean
  whisperPath: string
  ffmpegPath: string
}>({
  whisperInstalled: false,
  ffmpegInstalled: false,
  whisperPath: '',
  ffmpegPath: ''
})
const downloadingBinary = ref<'whisper' | 'ffmpeg' | null>(null)
const whisperDownloadProgress = ref(0)
const whisperDownloadStatus = ref<'downloading' | 'extracting' | 'done' | ''>('')
const ffmpegDownloadProgress = ref(0)
const ffmpegDownloadStatus = ref<'downloading' | 'extracting' | 'done' | ''>('')

// 设置
const settings = ref<SubtitleSettings>({ ...DEFAULT_SUBTITLE_SETTINGS })

// 是否有任何已下载的模型
const hasAnyModel = computed(() => models.value.some((m) => m.downloaded))

// 可用模型选项（已下载的）
const availableModelOptions = computed(() =>
  models.value.filter((m) => m.downloaded).map((m) => ({ label: m.displayName, value: m.name }))
)

// 语言选项
const languageOptions = [
  { label: '自动检测', value: 'auto' },
  { label: '日本語', value: 'ja' },
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '한국어', value: 'ko' }
]

// 加载模型列表
const loadModels = async () => {
  try {
    models.value = await window.subtitle.getModels()
  } catch (error: any) {
    console.error('加载模型列表失败:', error)
  }
}

// 加载设置
const loadSettings = async () => {
  try {
    const saved = await window.subtitle.getSettings()
    settings.value = { ...DEFAULT_SUBTITLE_SETTINGS, ...saved }
  } catch (error: any) {
    console.error('加载设置失败:', error)
  }
}

// 加载数据信息
const loadDataInfo = async () => {
  try {
    dataInfo.value = await window.subtitle.getDataInfo()
  } catch (error: any) {
    console.error('加载数据信息失败:', error)
  }
}

// 加载二进制文件状态
const loadBinaryStatus = async () => {
  try {
    binaryStatus.value = await window.subtitle.getBinaryStatus()
  } catch (error: any) {
    console.error('加载二进制状态失败:', error)
  }
}

// 下载二进制文件
const onDownloadBinary = async (binary: 'whisper' | 'ffmpeg') => {
  try {
    downloadingBinary.value = binary
    if (binary === 'whisper') {
      whisperDownloadProgress.value = 0
      whisperDownloadStatus.value = 'downloading'
    } else {
      ffmpegDownloadProgress.value = 0
      ffmpegDownloadStatus.value = 'downloading'
    }

    const removeListener = window.subtitle.onBinaryDownloadProgress((progress) => {
      if (progress.binary === binary) {
        if (binary === 'whisper') {
          whisperDownloadProgress.value = progress.percent
          whisperDownloadStatus.value = progress.status
        } else {
          ffmpegDownloadProgress.value = progress.percent
          ffmpegDownloadStatus.value = progress.status
        }
      }
    })

    const result =
      binary === 'whisper'
        ? await window.subtitle.downloadWhisper()
        : await window.subtitle.downloadFfmpeg()

    removeListener()

    if (result.success) {
      message.success(`${binary === 'whisper' ? 'Whisper.cpp' : 'FFmpeg'} 安装成功`)
      await loadBinaryStatus()
    } else {
      message.error(`安装失败: ${result.error}`)
    }
  } catch (error: any) {
    message.error(`下载失败: ${error.message}`)
  } finally {
    downloadingBinary.value = null
    whisperDownloadStatus.value = ''
    ffmpegDownloadStatus.value = ''
  }
}

// 选择数据存储目录
const onSelectDataDir = async () => {
  try {
    const selectedPath = await window.subtitle.selectDataDir()
    if (!selectedPath) return

    const result = await window.subtitle.migrateData(selectedPath)
    if (result.success) {
      settings.value.subtitleDataPath = selectedPath
      await window.subtitle.updateSettings({ subtitleDataPath: selectedPath })
      message.success(`数据存储位置已更改为: ${selectedPath}`)
      await loadDataInfo()
    }
  } catch (error: any) {
    message.error(`更改存储位置失败: ${error.message}`)
  }
}

// 重置为默认路径
const onResetDataDir = async () => {
  try {
    settings.value.subtitleDataPath = ''
    await window.subtitle.updateSettings({ subtitleDataPath: '' })
    message.success('已重置为默认存储位置')
    await loadDataInfo()
  } catch (error: any) {
    message.error(`重置失败: ${error.message}`)
  }
}

// 下载模型
const onDownloadModel = async (modelName: WhisperModelName) => {
  try {
    downloadingModel.value = modelName
    downloadProgress.value = 0

    const removeListener = window.subtitle.onDownloadProgress((progress) => {
      if (progress.model === modelName) {
        downloadProgress.value = progress.percent
      }
    })

    await window.subtitle.downloadModel(modelName)

    removeListener()
    message.success(`模型 ${modelName} 下载完成`)
    await loadModels()
  } catch (error: any) {
    message.error(`模型下载失败: ${error.message}`)
  } finally {
    downloadingModel.value = null
    downloadProgress.value = 0
  }
}

// 删除模型
const onDeleteModel = async (modelName: WhisperModelName) => {
  try {
    await window.subtitle.deleteModel(modelName)
    message.success(`模型 ${modelName} 已删除`)
    await loadModels()
  } catch (error: any) {
    message.error(`删除失败: ${error.message}`)
  }
}

// 清除缓存
const onClearCache = async () => {
  try {
    await window.subtitle.clearCache()
    message.success('字幕缓存已清除')
  } catch (error: any) {
    message.error(`清除失败: ${error.message}`)
  }
}

// 保存设置（防抖）
let saveTimer: number | null = null
watch(
  settings,
  () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await window.subtitle.updateSettings(settings.value)
      } catch (error: any) {
        console.error('保存设置失败:', error)
      }
    }, 500) as unknown as number
  },
  { deep: true }
)

onMounted(() => {
  loadModels()
  loadSettings()
  loadDataInfo()
  loadBinaryStatus()
})
</script>

<style lang="scss" scoped>
.subtitle-settings {
  padding: 16px;

  .binary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--n-border-color, #eee);

    &:last-child {
      border-bottom: none;
    }

    .binary-info {
      display: flex;
      align-items: center;
      gap: 8px;

      .binary-name {
        font-weight: 500;
        min-width: 80px;
      }
    }

    .binary-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  .model-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--n-border-color, #eee);

    &:last-child {
      border-bottom: none;
    }

    .model-info {
      display: flex;
      align-items: center;
      gap: 8px;

      .model-name {
        font-weight: 500;
      }
    }

    .model-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
}
</style>

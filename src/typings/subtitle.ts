/**
 * 字幕相关类型定义
 */

/** 支持的 Whisper 模型 */
export type WhisperModelName = 'tiny' | 'base' | 'small' | 'medium' | 'large'

/** 支持的语言 */
export type SubtitleLanguage = 'auto' | 'ja' | 'zh' | 'en' | 'ko'

/** 字幕位置 */
export type SubtitlePosition = 'top' | 'bottom'

/** 模型信息 */
export interface ModelInfo {
    name: WhisperModelName
    displayName: string
    size: string
    sizeBytes: number
    downloaded: boolean
    path?: string
    downloadUrl: string
}

/** 字幕生成选项 */
export interface GenerateOptions {
    language: SubtitleLanguage
    model: WhisperModelName
    force?: boolean
}

/** 实时识别选项 */
export interface RealtimeOptions {
    language: SubtitleLanguage
    model: WhisperModelName
    chunkDuration: number // 秒
}

/** 字幕设置 */
export interface SubtitleSettings {
    defaultLanguage: SubtitleLanguage
    defaultModel: WhisperModelName
    useGpu: boolean
    fontSize: number
    subtitlePosition: SubtitlePosition
    opacity: number
    autoGenerate: boolean
    /** 字幕数据存储路径（模型、缓存、临时文件），为空则使用 userData 目录 */
    subtitleDataPath: string
}

/** 字幕段落 */
export interface SubtitleSegment {
    id: number
    startTime: number // 秒
    endTime: number // 秒
    text: string
}

/** 字幕缓存信息 */
export interface SubtitleCacheInfo {
    cached: boolean
    subtitlePath?: string
    generateTime?: number // 生成耗时（毫秒）
    model?: WhisperModelName
    language?: SubtitleLanguage
}

/** 生成进度 */
export interface GenerateProgress {
    /** 已处理时长（秒） */
    processedDuration: number
    /** 总时长（秒） */
    totalDuration: number
    /** 进度百分比 0-100 */
    percent: number
    /** 当前正在生成的段落文本（预览） */
    currentText?: string
}

/** 字幕默认设置 */
export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
    defaultLanguage: 'ja',
    defaultModel: 'small',
    useGpu: true,
    fontSize: 24,
    subtitlePosition: 'bottom',
    opacity: 0.8,
    autoGenerate: true,
    subtitleDataPath: ''
}

/** 模型下载地址映射 */
export const MODEL_DOWNLOAD_URLS: Record<WhisperModelName, string> = {
    tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    large: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
}

/** 模型信息映射 */
export const MODEL_INFO: Record<WhisperModelName, Omit<ModelInfo, 'downloaded' | 'path'>> = {
    tiny: {
        name: 'tiny',
        displayName: 'Tiny (~75MB)',
        size: '~75MB',
        sizeBytes: 75 * 1024 * 1024,
        downloadUrl: MODEL_DOWNLOAD_URLS.tiny
    },
    base: {
        name: 'base',
        displayName: 'Base (~142MB)',
        size: '~142MB',
        sizeBytes: 142 * 1024 * 1024,
        downloadUrl: MODEL_DOWNLOAD_URLS.base
    },
    small: {
        name: 'small',
        displayName: 'Small (~466MB)',
        size: '~466MB',
        sizeBytes: 466 * 1024 * 1024,
        downloadUrl: MODEL_DOWNLOAD_URLS.small
    },
    medium: {
        name: 'medium',
        displayName: 'Medium (~1.5GB)',
        size: '~1.5GB',
        sizeBytes: 1536 * 1024 * 1024,
        downloadUrl: MODEL_DOWNLOAD_URLS.medium
    },
    large: {
        name: 'large',
        displayName: 'Large (~2.9GB)',
        size: '~2.9GB',
        sizeBytes: 2900 * 1024 * 1024,
        downloadUrl: MODEL_DOWNLOAD_URLS.large
    }
}

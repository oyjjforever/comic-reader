/**
 * 字幕相关类型定义
 */

/** 支持的 Whisper 模型 */
export type WhisperModelName = 'tiny' | 'base' | 'small' | 'medium' | 'large'

/** 支持的语言 */
export type SubtitleLanguage = 'auto' | 'ja' | 'zh' | 'en' | 'ko'

/** 翻译目标语言 */
export type TranslateTarget = 'zh' | 'en' | 'ko' | 'ja' | 'fr' | 'de' | 'es' | 'ru' | 'pt' | 'it'

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
    /** 是否启用翻译 */
    translateEnabled: boolean
    /** 翻译目标语言 */
    translateTarget: TranslateTarget
    /** 翻译模型别名（对应 @electron/llm 的 modelAlias） */
    translateModelAlias: string
}

/** 翻译结果 */
export interface TranslateResult {
    originalText: string
    translatedText: string
    from: string
    to: string
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
    subtitleDataPath: '',
    translateEnabled: false,
    translateTarget: 'zh',
    translateModelAlias: 'HY-MT1.5-1.8B-Q4_K_M'
}

/** 翻译模型信息 */
export interface TranslateModelInfo {
    /** 模型别名（用于 @electron/llm 的 modelAlias） */
    alias: string
    /** 显示名称 */
    displayName: string
    /** 模型大小描述 */
    size: string
    /** 大约文件大小（字节） */
    sizeBytes: number
    /** 下载地址 */
    downloadUrl: string
    /** 是否已下载 */
    downloaded: boolean
    /** 本地文件路径 */
    path?: string
}

/** 预置翻译模型下载地址（腾讯混元 Hy-MT1.5 翻译专用模型，标准量化格式） */
export const TRANSLATE_MODEL_PRESETS: Omit<TranslateModelInfo, 'downloaded' | 'path'>[] = [
    {
        alias: 'HY-MT1.5-1.8B-Q4_K_M',
        displayName: '混元 Hy-MT1.5 1.8B (Q4_K_M, ~1.1GB)',
        size: '~1.1GB',
        sizeBytes: 1133080512,
        downloadUrl: 'https://huggingface.co/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/HY-MT1.5-1.8B-Q4_K_M.gguf'
    },
    {
        alias: 'HY-MT1.5-1.8B-Q6_K',
        displayName: '混元 Hy-MT1.5 1.8B (Q6_K, ~1.4GB)',
        size: '~1.4GB',
        sizeBytes: 1474785216,
        downloadUrl: 'https://huggingface.co/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/HY-MT1.5-1.8B-Q6_K.gguf'
    }
]

/** 翻译目标语言选项 */
export const TRANSLATE_TARGET_OPTIONS: { label: string; value: TranslateTarget }[] = [
    { label: '中文', value: 'zh' },
    { label: 'English', value: 'en' },
    { label: '日本語', value: 'ja' },
    { label: '한국어', value: 'ko' },
    { label: 'Français', value: 'fr' },
    { label: 'Deutsch', value: 'de' },
    { label: 'Español', value: 'es' },
    { label: 'Русский', value: 'ru' },
    { label: 'Português', value: 'pt' },
    { label: 'Italiano', value: 'it' }
]

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

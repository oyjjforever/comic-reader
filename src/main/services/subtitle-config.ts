/**
 * 字幕数据目录配置
 * 提供统一的数据目录解析，支持自定义路径避免占用 C 盘
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { DEFAULT_SUBTITLE_SETTINGS } from '../../typings/subtitle'
import type { SubtitleSettings } from '../../typings/subtitle'

/** 设置文件路径 */
function getSettingsFilePath(): string {
    return path.join(app.getPath('userData'), 'subtitle-settings.json')
}

/** 读取字幕设置 */
export function readSubtitleSettings(): SubtitleSettings {
    try {
        const settingsPath = getSettingsFilePath()
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
            return { ...DEFAULT_SUBTITLE_SETTINGS, ...data }
        }
    } catch {
        // 忽略读取错误
    }
    return { ...DEFAULT_SUBTITLE_SETTINGS }
}

/**
 * 获取字幕数据根目录
 * 如果用户配置了 subtitleDataPath 则使用自定义路径，否则使用 userData
 */
export function getSubtitleDataDir(): string {
    const settings = readSubtitleSettings()
    const basePath = settings.subtitleDataPath || app.getPath('userData')

    if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true })
    }

    return basePath
}

/** 获取模型存储目录 */
export function getModelsDir(): string {
    const dir = path.join(getSubtitleDataDir(), 'whisper-models')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/** 获取临时文件目录 */
export function getTempDir(): string {
    const dir = path.join(getSubtitleDataDir(), 'subtitle-temp')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/** 获取字幕缓存目录 */
export function getSubtitleCacheDir(): string {
    const dir = path.join(getSubtitleDataDir(), 'subtitle-cache')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

/**
 * 计算字幕数据占用的磁盘空间（字节）
 */
export function getSubtitleDataSize(): number {
    const dataDir = getSubtitleDataDir()
    let totalSize = 0

    const subDirs = ['whisper-models', 'subtitle-temp', 'subtitle-cache']
    for (const subDir of subDirs) {
        const dirPath = path.join(dataDir, subDir)
        totalSize += getDirSize(dirPath)
    }

    return totalSize
}

/** 递归计算目录大小 */
function getDirSize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0

    let size = 0
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
                size += getDirSize(fullPath)
            } else if (entry.isFile()) {
                try {
                    size += fs.statSync(fullPath).size
                } catch {
                    // 忽略无法访问的文件
                }
            }
        }
    } catch {
        // 忽略无法访问的目录
    }
    return size
}

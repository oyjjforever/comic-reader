/**
 * HLS 加密视频下载器
 * 纯 Node.js 实现：M3U8 解析 → AES-128-CBC 解密 → TS 片段合并为 MP4
 * 参考 视频下载.md
 */
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import log from '../../utils/log'

export interface HlsProgress {
  type: string
  [key: string]: unknown
}

export interface HlsDownloadOptions {
  concurrency?: number
  timeout?: number
  tempDirPrefix?: string
  /** 单个片段下载失败时的最大重试次数 */
  maxRetries?: number
}

export interface HlsDownloadResult {
  success: boolean
  outputPath: string
  quality: string
  segments: number
  duration: number
}

export type ProgressCallback = (progress: HlsProgress) => void

interface Segment {
  url: string
  duration: number
  index: number
}

interface ParsedM3U8 {
  keyUrl: string
  iv: Buffer | null
  segments: Segment[]
}

export class HLSDownloader {
  private m3u8Url: string
  private headers: Record<string, string>
  private concurrency: number
  private timeout: number
  private tempDirPrefix: string
  private maxRetries: number
  private tempDir: string | null = null
  private isCanceled = false

  constructor(
    m3u8Url: string,
    headers: Record<string, string>,
    options: HlsDownloadOptions = {}
  ) {
    this.m3u8Url = m3u8Url
    this.headers = headers
    this.concurrency = options.concurrency ?? 8
    this.timeout = options.timeout ?? 60000
    this.tempDirPrefix = options.tempDirPrefix ?? 'hls_'
    this.maxRetries = options.maxRetries ?? 3
  }

  /** 取消下载 */
  cancel(): void {
    this.isCanceled = true
  }

  /** 获取 M3U8 文本内容 */
  private async fetchM3U8(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.timeout,
        responseType: 'text'
      })
      return response.data as string
    } catch (error) {
      throw new Error(`获取 M3U8 失败: ${(error as Error).message}`)
    }
  }

  /**
   * 解析 Master M3U8，选取分辨率最高（BANDWIDTH 最大）的子 M3U8 URL
   * quality 参数仅用于日志展示，实际始终选最高码率变体
   */
  private parseMasterM3U8(content: string, quality: string): string {
    const lines = content.split('\n')
    interface Variant {
      url: string
      bandwidth: number
      width: number
      height: number
    }
    const variants: Variant[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const nextLine = lines[i + 1]?.trim()
        if (!nextLine || nextLine.startsWith('#')) continue

        const bandwidth = parseInt(line.match(/BANDWIDTH=(\d+)/)?.[1] || '0', 10)
        const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/)
        const width = resMatch ? parseInt(resMatch[1], 10) : 0
        const height = resMatch ? parseInt(resMatch[2], 10) : 0
        variants.push({ url: nextLine, bandwidth, width, height })
      }
    }

    if (variants.length === 0) {
      throw new Error(`未找到 ${quality} 清晰度`)
    }

    // 按 BANDWIDTH 降序（BANDWIDTH 相同时按分辨率面积降序）
    variants.sort((a, b) => {
      if (b.bandwidth !== a.bandwidth) return b.bandwidth - a.bandwidth
      return b.width * b.height - a.width * a.height
    })

    return new URL(variants[0].url, this.m3u8Url).href
  }

  /** 解析子 M3U8，提取密钥信息和片段列表 */
  private parseM3U8(content: string, playlistUrl: string): ParsedM3U8 {
    const lines = content.split('\n')
    const segments: Segment[] = []
    let keyUrl: string | null = null
    let iv: Buffer | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (line.startsWith('#EXT-X-KEY:')) {
        const uriMatch = line.match(/URI="([^"]+)"/)
        if (uriMatch) {
          // EXT-X-KEY 的 URI 相对于当前播放列表解析
          keyUrl = new URL(uriMatch[1], playlistUrl).href
        }
        const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/)
        if (ivMatch) {
          iv = Buffer.from(ivMatch[1], 'hex')
        }
      }

      if (line.startsWith('#EXTINF:')) {
        const duration = parseFloat(line.split(':')[1].replace(/,.*$/, ''))
        const nextLine = lines[i + 1]?.trim()
        if (nextLine && !nextLine.startsWith('#')) {
          // 片段地址相对于当前播放列表（子 m3u8）解析，例如：
          // 子 m3u8: .../179/1080p/index.m3u8 → seg_00001.ts => .../179/1080p/seg_00001.ts
          const segmentUrl = new URL(nextLine, playlistUrl).href
          segments.push({ url: segmentUrl, duration, index: segments.length })
        }
      }
    }

    return { keyUrl: keyUrl as string, iv, segments }
  }

  /** 下载解密密钥（16 字节 AES-128） */
  private async fetchKey(keyUrl: string): Promise<Buffer> {
    try {
      const response = await axios.get(keyUrl, {
        headers: this.headers,
        responseType: 'arraybuffer',
        timeout: this.timeout
      })
      const keyBuffer = Buffer.from(response.data as ArrayBuffer)
      if (keyBuffer.length !== 16) {
        throw new Error(`密钥长度错误: 期望 16 字节，实际 ${keyBuffer.length} 字节`)
      }
      return keyBuffer
    } catch (error) {
      throw new Error(`下载密钥失败: ${(error as Error).message}`)
    }
  }

  /** 默认 IV：16 字节大端序序号 */
  private defaultIv(segmentIndex: number): Buffer {
    const buf = Buffer.alloc(16, 0)
    buf.writeUInt32BE(segmentIndex, 12)
    return buf
  }

  /** 合并 TS 片段为单个文件 */
  private async mergeSegments(
    tempDir: string,
    outputFile: string,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    const files = fs
      .readdirSync(tempDir)
      .filter((f) => f.endsWith('.ts'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('seg_', '').replace('.ts', ''), 10)
        const numB = parseInt(b.replace('seg_', '').replace('.ts', ''), 10)
        return numA - numB
      })

    if (files.length === 0) {
      throw new Error('没有找到可合并的 TS 片段')
    }

    const writeStream = fs.createWriteStream(outputFile)
    let merged = 0

    for (const file of files) {
      if (this.isCanceled) {
        writeStream.close()
        throw new Error('合并已取消')
      }
      const data = fs.readFileSync(path.join(tempDir, file))
      writeStream.write(data)
      merged++
      progressCallback?.({
        type: 'merge',
        current: merged,
        total: files.length
      })
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end()
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
  }

  /**
   * 主下载流程
   * @param quality 目标清晰度（如 1080p），未命中则回退到首个变体
   * @param outputPath 输出 MP4 文件路径
   * @param progressCallback 进度回调
   */
  async download(
    quality: string,
    outputPath: string,
    progressCallback?: ProgressCallback
  ): Promise<HlsDownloadResult> {
    try {
      progressCallback?.({ type: 'fetch_master', message: '正在获取播放列表...' })
      const masterContent = await this.fetchM3U8(this.m3u8Url)

      // 若主播放列表不含子变体，则它本身就是媒体播放列表
      let subContent: string
      let playlistUrl = this.m3u8Url
      if (/#EXT-X-STREAM-INF/.test(masterContent)) {
        progressCallback?.({ type: 'parse_master', message: '正在解析清晰度...' })
        const subM3U8Url = this.parseMasterM3U8(masterContent, quality)
        progressCallback?.({ type: 'fetch_sub', message: `正在获取 ${quality} 播放列表...` })
        subContent = await this.fetchM3U8(subM3U8Url)
        playlistUrl = subM3U8Url
      } else {
        subContent = masterContent
      }

      progressCallback?.({ type: 'parse_sub', message: '正在解析视频信息...' })
      const parsed = this.parseM3U8(subContent, playlistUrl)

      // 无加密信息：直接下载原始片段
      const isEncrypted = !!parsed.keyUrl
      let key: Buffer | null = null
      if (isEncrypted) {
        progressCallback?.({ type: 'fetch_key', message: '正在下载解密密钥...' })
        key = await this.fetchKey(parsed.keyUrl)
      }

      this.tempDir = path.join(
        app.getPath('temp'),
        `${this.tempDirPrefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      )
      fs.mkdirSync(this.tempDir, { recursive: true })

      const segments = parsed.segments
      const totalSegments = segments.length
      let downloaded = 0

      progressCallback?.({
        type: 'download_start',
        total: totalSegments,
        message: `开始下载 ${totalSegments} 个片段...`
      })

      for (let i = 0; i < segments.length; i += this.concurrency) {
        if (this.isCanceled) throw new Error('下载已取消')

        const batch = segments.slice(i, i + this.concurrency)
        await Promise.all(
          batch.map(async (seg) => {
            const segIndex = seg.index
            const segPath = path.join(this.tempDir!, `seg_${String(segIndex).padStart(5, '0')}.ts`)
            if (isEncrypted && key) {
              const iv = parsed.iv ?? this.defaultIv(segIndex)
              await this.decryptWithIv(seg.url, key, iv, segPath)
            } else {
              await this.downloadRaw(seg.url, segPath)
            }
            downloaded++
            progressCallback?.({
              type: 'download_progress',
              current: downloaded,
              total: totalSegments,
              percent: Math.round((downloaded / totalSegments) * 100)
            })
          })
        )
      }

      progressCallback?.({ type: 'merge_start', message: '正在合并视频片段...' })
      await this.mergeSegments(this.tempDir, outputPath, progressCallback)

      progressCallback?.({ type: 'cleanup', message: '正在清理临时文件...' })
      this.cleanupTemp()

      const result: HlsDownloadResult = {
        success: true,
        outputPath,
        quality,
        segments: totalSegments,
        duration: segments.reduce((sum, seg) => sum + seg.duration, 0)
      }
      progressCallback?.({
        type: 'complete',
        message: '下载完成！',
        outputPath,
        result
      })
      return result
    } catch (error) {
      this.cleanupTemp()
      throw error
    }
  }

  /** 下载加密片段并用指定 IV 解密 */
  private async decryptWithIv(
    segmentUrl: string,
    key: Buffer,
    iv: Buffer,
    outputPath: string
  ): Promise<void> {
    let encryptedData: Buffer | null = null
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.isCanceled) throw new Error('下载已取消')
      try {
        console.log("🚀 ~ HLSDownloader ~ decryptWithIv ~ segmentUrl:", segmentUrl)
        const response = await axios.get(segmentUrl, {
          headers: this.headers,
          responseType: 'arraybuffer',
          timeout: this.timeout
        })
        encryptedData = Buffer.from(response.data as ArrayBuffer)
        break
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new Error(
            `下载片段失败 (${path.basename(segmentUrl)}): ${(error as Error).message}`
          )
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
    if (!encryptedData) throw new Error('下载片段失败: 数据为空')

    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
    decipher.setAutoPadding(true)
    let decrypted = decipher.update(encryptedData)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    fs.writeFileSync(outputPath, decrypted)
  }

  /** 下载未加密的原始片段 */
  private async downloadRaw(segmentUrl: string, outputPath: string): Promise<void> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.isCanceled) throw new Error('下载已取消')
      try {
        console.log("🚀 ~ HLSDownloader ~ downloadRaw ~ segmentUrl:", segmentUrl)
        const response = await axios.get(segmentUrl, {
          headers: this.headers,
          responseType: 'arraybuffer',
          timeout: this.timeout
        })
        fs.writeFileSync(outputPath, Buffer.from(response.data as ArrayBuffer))
        return
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new Error(
            `下载片段失败 (${path.basename(segmentUrl)}): ${(error as Error).message}`
          )
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  }

  private cleanupTemp(): void {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true })
      } catch (e) {
        log.warn('[HLS] 清理临时目录失败:', (e as Error).message)
      }
    }
    this.tempDir = null
  }
}

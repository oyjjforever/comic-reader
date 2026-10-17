/**
 * HLS 加密视频下载器（preload 版）
 * 移植自 src/main/services/hls-downloader.ts：
 * - 不依赖主进程 app 模块：临时目录用 os.tmpdir()，ffmpeg 路径复用 subtitle:get-binary-status IPC
 * - 下载在 preload（Node 环境）中直接执行，无需 huangguo:* IPC
 */
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import http from 'http'
import https from 'https'
import { spawn } from 'child_process'
import { ipcRenderer } from 'electron'

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, keepAliveMsecs: 30000 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, keepAliveMsecs: 30000 })

// 强制使用 Node http 适配器，避免 axios 在 preload 环境回退到 XHR（XHR 禁止设置 Referer/Cookie/User-Agent）
const client = axios.create({
  adapter: 'http',
  httpAgent,
  httpsAgent
})

const FFMPEG_BIN_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
let ffmpegPathCache = null

async function getFfmpegPath() {
  if (ffmpegPathCache) return ffmpegPathCache
  try {
    const status = await ipcRenderer.invoke('subtitle:get-binary-status')
    if (status?.ffmpegInstalled && status?.ffmpegPath && fs.existsSync(status.ffmpegPath)) {
      ffmpegPathCache = status.ffmpegPath
      return ffmpegPathCache
    }
  } catch {
    /* ignore */
  }
  const bundled = path.join(process.resourcesPath, 'ffmpeg', FFMPEG_BIN_NAME)
  if (fs.existsSync(bundled)) {
    ffmpegPathCache = bundled
    return bundled
  }
  return FFMPEG_BIN_NAME
}

export default class HlsDownloader {
  constructor(m3u8Url, headers, options = {}) {
    this.m3u8Url = m3u8Url
    this.headers = headers || {}
    this.concurrency = options.concurrency ?? 8
    this.timeout = options.timeout ?? 60000
    this.tempDirPrefix = options.tempDirPrefix ?? 'hls_'
    this.maxRetries = options.maxRetries ?? 3
    this.tempDir = null
    this.isCanceled = false
  }

  cancel() {
    this.isCanceled = true
  }

  async fetchText(url) {
    try {
      const response = await client.get(url, {
        headers: this.headers,
        timeout: this.timeout,
        responseType: 'text'
      })
      return response.data
    } catch (error) {
      throw new Error(`获取 M3U8 失败: ${error.message}`)
    }
  }

  async fetchBinary(url) {
    const response = await client.get(url, {
      headers: this.headers,
      responseType: 'arraybuffer',
      timeout: this.timeout
    })
    return Buffer.from(response.data)
  }

  parseMasterM3U8(content, quality) {
    const lines = content.split('\n')
    const variants = []

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

    variants.sort((a, b) => {
      if (b.bandwidth !== a.bandwidth) return b.bandwidth - a.bandwidth
      return b.width * b.height - a.width * a.height
    })

    return new URL(variants[0].url, this.m3u8Url).href
  }

  parseM3U8(content, playlistUrl) {
    const lines = content.split('\n')
    const segments = []
    let keyUrl = null
    let iv = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (line.startsWith('#EXT-X-KEY:')) {
        const uriMatch = line.match(/URI="([^"]+)"/)
        if (uriMatch) {
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
          const segmentUrl = new URL(nextLine, playlistUrl).href
          segments.push({ url: segmentUrl, duration, index: segments.length })
        }
      }
    }

    return { keyUrl, iv, segments }
  }

  async fetchKey(keyUrl) {
    try {
      const keyBuffer = await this.fetchBinary(keyUrl)
      if (keyBuffer.length !== 16) {
        throw new Error(`密钥长度错误: 期望 16 字节，实际 ${keyBuffer.length} 字节`)
      }
      return keyBuffer
    } catch (error) {
      throw new Error(`下载密钥失败: ${error.message}`)
    }
  }

  defaultIv(segmentIndex) {
    const buf = Buffer.alloc(16, 0)
    buf.writeUInt32BE(segmentIndex, 12)
    return buf
  }

  async remuxToMp4(tsFile, outputFile) {
    const ffmpegPath = await getFfmpegPath()
    const remuxed = await new Promise((resolve) => {
      const args = [
        '-y',
        '-i',
        tsFile,
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        '-movflags',
        '+faststart',
        outputFile
      ]
      const child = spawn(ffmpegPath, args)
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += d.toString()
      })
      child.on('close', (code) => {
        resolve(code === 0)
      })
      child.on('error', () => {
        console.warn('[HLS] ffmpeg 不可用，回退为直接拼接输出:', stderr.slice(-500))
        resolve(false)
      })
    })
    if (!remuxed) {
      fs.copyFileSync(tsFile, outputFile)
    }
  }

  async mergeSegments(tempDir, outputFile, progressCallback) {
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

    const outputDir = path.dirname(outputFile)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const mergedTsFile = path.join(tempDir, `merged_${Date.now()}.ts`)
    const writeStream = fs.createWriteStream(mergedTsFile)
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

    await new Promise((resolve, reject) => {
      writeStream.end()
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    progressCallback?.({ type: 'remux', message: '正在封装为 MP4...' })
    await this.remuxToMp4(mergedTsFile, outputFile)
    try {
      fs.rmSync(mergedTsFile, { force: true })
    } catch {
      /* ignore */
    }
  }

  async download(quality, outputPath, progressCallback) {
    try {
      progressCallback?.({ type: 'fetch_master', message: '正在获取播放列表...' })
      const masterContent = await this.fetchText(this.m3u8Url)

      let subContent
      let playlistUrl = this.m3u8Url
      if (/#EXT-X-STREAM-INF/.test(masterContent)) {
        progressCallback?.({ type: 'parse_master', message: '正在解析清晰度...' })
        const subM3U8Url = this.parseMasterM3U8(masterContent, quality)
        progressCallback?.({ type: 'fetch_sub', message: `正在获取 ${quality} 播放列表...` })
        subContent = await this.fetchText(subM3U8Url)
        playlistUrl = subM3U8Url
      } else {
        subContent = masterContent
      }

      progressCallback?.({ type: 'parse_sub', message: '正在解析视频信息...' })
      const parsed = this.parseM3U8(subContent, playlistUrl)

      const isEncrypted = !!parsed.keyUrl
      let key = null
      if (isEncrypted) {
        progressCallback?.({ type: 'fetch_key', message: '正在下载解密密钥...' })
        key = await this.fetchKey(parsed.keyUrl)
      }

      this.tempDir = path.join(
        os.tmpdir(),
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
            const segPath = path.join(this.tempDir, `seg_${String(segIndex).padStart(5, '0')}.ts`)
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

      const result = {
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

  async decryptWithIv(segmentUrl, key, iv, outputPath) {
    let encryptedData = null
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.isCanceled) throw new Error('下载已取消')
      try {
        encryptedData = await this.fetchBinary(segmentUrl)
        break
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new Error(`下载片段失败 (${path.basename(segmentUrl)}): ${error.message}`)
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

  async downloadRaw(segmentUrl, outputPath) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.isCanceled) throw new Error('下载已取消')
      try {
        const data = await this.fetchBinary(segmentUrl)
        fs.writeFileSync(outputPath, data)
        return
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new Error(`下载片段失败 (${path.basename(segmentUrl)}): ${error.message}`)
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  }

  cleanupTemp() {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true })
      } catch (e) {
        console.warn('[HLS] 清理临时目录失败:', e?.message)
      }
    }
    this.tempDir = null
  }
}

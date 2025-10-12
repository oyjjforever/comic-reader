/**
 * 在 Preload 中直接集成 DLNA 发现与投屏，避免走主进程 IPC。
 * 并提供 serveAndPlay：为本地文件启动 HTTP 服务（支持 Range），用于跨设备投屏。
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DLNACasts = require('dlnacasts')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const mime = require('mime-types')

class DLNAManager {
  public dlnacasts: any

  constructor() {
    this.dlnacasts = null
    this.init()
  }

  getDevices() {
    // 返回浅拷贝，避免外部直接修改内部数组
    return [...this.dlnacasts.players]
  }

  init() {
    this.dlnacasts = DLNACasts()

    // 主动触发一次扫描
    this.dlnacasts.update()
  }

  // 根据名称获取设备对象
  getDeviceByName(name: string) {
    return this.dlnacasts.players.find((device) => device.name === name)
  }

  // 开始搜索设备
  startSearch() {
    this.dlnacasts.update()
  }

  /**
   * 投屏到指定设备
   * @param deviceName 设备名称
   * @param videoUrl 播放地址（建议 http/https 或 file://）
   * @param contentType 媒体类型，默认 'video/mp4'
   */
  play(deviceName: string, videoUrl: string, contentType = 'video/mp4') {
    const device = this.getDeviceByName(deviceName)
    if (!device) {
      throw new Error(`未找到设备: ${deviceName}`)
    }
    if (typeof device.play !== 'function') {
      throw new Error('目标设备不支持播放接口')
    }
    device.play(videoUrl, { contentType })
  }
}

// 单例
const manager = new DLNAManager()

function getLANAddress(): string | null {
  const nets = os.networkInterfaces() || {}
  for (const name of Object.keys(nets)) {
    const addrs = nets[name] || []
    for (const addr of addrs) {
      if (
        addr &&
        addr.family === 'IPv4' &&
        !addr.internal &&
        addr.address &&
        // 过滤常见本地网段均可（192.168.x.x / 10.x.x.x / 172.16-31.x.x）
        (
          addr.address.startsWith('192.168.') ||
          addr.address.startsWith('10.') ||
          (addr.address.startsWith('172.') && (() => {
            const second = parseInt(addr.address.split('.')[1] || '0', 10)
            return second >= 16 && second <= 31
          })())
        )
      ) {
        return addr.address
      }
    }
  }
  // 若未匹配到常见内网段，返回第一个非内网回环的 IPv4
  for (const name of Object.keys(nets)) {
    const addrs = nets[name] || []
    for (const addr of addrs) {
      if (addr && addr.family === 'IPv4' && !addr.internal && addr.address) {
        return addr.address
      }
    }
  }
  return null
}

function createRangeServer(filePath: string, contentType: string) {
  const stat = fs.statSync(filePath)
  const total = stat.size

  const server = http.createServer((req: any, res: any) => {
    if (req.url !== '/media') {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    // 优化 TCP：关闭 Nagle，降低延迟
    if (req.socket && typeof req.socket.setNoDelay === 'function') {
      req.socket.setNoDelay(true)
    }
    res.setHeader('Content-Type', contentType)
    res.setHeader('Accept-Ranges', 'bytes')
    // 启用 keep-alive，减少连接握手
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Keep-Alive', 'timeout=15, max=1000')
    // DLNA 兼容性与性能相关头
    res.setHeader('transferMode.dlna.org', 'Streaming')
    res.setHeader(
      'contentFeatures.dlna.org',
      'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000'
    )
    // 基本缓存与条件请求，降低重复验证
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Last-Modified', stat.mtime.toUTCString())
    res.setHeader('ETag', `${total}-${stat.mtimeMs}`)

    const range = req.headers.range
    if (range) {
      // 解析 bytes=START-END
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      let start = 0
      let end = total - 1
      if (match) {
        if (match[1]) start = parseInt(match[1], 10)
        if (match[2]) end = parseInt(match[2], 10)
        // 默认块大小提高到 8MB，减少请求轮次以提升吞吐
        if (!match[2]) end = Math.min(start + 8 * 1024 * 1024 - 1, total - 1)
      }
      start = Math.max(0, start)
      end = Math.min(end, total - 1)

      const chunkSize = end - start + 1
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
      res.setHeader('Content-Length', String(chunkSize))

      const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 })
      stream.on('error', (e: any) => {
        res.statusCode = 500
        res.end(String(e?.message || e))
      })
      stream.pipe(res)
    } else {
      res.statusCode = 200
      res.setHeader('Content-Length', String(total))
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      stream.on('error', (e: any) => {
        res.statusCode = 500
        res.end(String(e?.message || e))
      })
      stream.pipe(res)
    }
  })

    ; (server as any).keepAliveTimeout = 15000
  return { server }
}

async function serveAndPlay(deviceName: string, filePath: string) {
  const contentType = (mime.lookup(path.extname(filePath)) as string) || 'video/mp4'
  const lanIP = getLANAddress()
  if (!lanIP) throw new Error('未检测到可用的局域网 IP')

  const { server } = createRangeServer(filePath, contentType)
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? (addr as any).port : null
  if (!port) {
    server.close()
    throw new Error('HTTP 服务启动失败')
  }

  const url = `http://${lanIP}:${port}/media`
  // 投屏
  manager.play(deviceName, url, contentType)

  // 可根据需要在稍后关闭服务；这里暂时保留，交由设备拉流
  // setTimeout(() => server.close(), 60 * 60 * 1000) // 例如 1 小时后关闭

  return true
}

const dlna = {
  async getDevices(): Promise<Array<{ name: string }>> {
    manager.startSearch()
    return manager.getDevices()
  },
  async play(deviceName: string, videoUrl: string, contentType = 'video/mp4'): Promise<boolean> {
    manager.play(deviceName, videoUrl, contentType)
    return true
  },
  async serveAndPlay(deviceName: string, filePath: string): Promise<boolean> {
    return await serveAndPlay(deviceName, filePath)
  }
}

export default dlna
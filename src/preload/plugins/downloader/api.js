import axios from 'axios'
function buildAxios(config) {
  const instance = axios.create({
    // 超时可根据需要调整
    timeout: 10000,
    // 代理
    proxy:
      config?.proxyMode === 'Custom'
        ? {
            protocol: 'http',
            host: config.proxyHost,
            port: config.proxyPort
          }
        : config?.proxyMode === 'NoProxy'
          ? false
          : undefined, // System/默认
    validateStatus: () => true // 手动处理状态码
  })
  return instance
}
// 简单重试封装：最多 totalMs 时间窗口内每秒重试一次（或固定重试次数）
async function withRetry(fn, { maxRetries = 2, delayMs = 1000 } = {}) {
  let lastErr
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i === maxRetries) break
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

export default class Api {
  constructor(appConfig = {}) {
    this.api = buildAxios(appConfig)
  }
  async request(method, config) {
    let formData
    if (config.formData) {
      formData = new FormData()
      Object.keys(config.formData).forEach((key) => {
        formData.append(key, config.formData[key])
      })
    }
    const req = {
      method,
      headers: Object.assign({}, config?.headers),
      ...config
    }
    req.headers['user-agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

    return withRetry(async () => {
      try {
        const resp = await this.api.request(req)
        if (resp.status !== 200) throw new Error(`${resp.status} ${resp.statusText}`)
        return resp.data
      } catch (e) {
        console.log(e.message)
        throw e
      }
    })
  }

  get(config) {
    return this.request('GET', config)
  }

  post(config) {
    return this.request('POST', config)
  }
}

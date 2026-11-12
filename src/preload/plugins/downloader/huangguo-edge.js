import crypto from 'crypto'
import Api from './api.js'

// huangguoai.com 播放地址加密通道客户端（协议 dx150-edge-v1，对应站点 edge-api-crypto.js）
// 站点 2026-11 起播放地址只经此通道下发，旧明文接口 video_url 恒为空。
// 协议：ECDH P-256 握手 → HKDF-SHA256 派生请求/响应两把 AES-256-GCM 密钥，
// 业务包 { method, path, body(base64), content_type, visitor_id } 加密后 POST /api/playback/request。
// visitor_id 必填（缺失服务端直接回 invalid_request）。
const SITE_ORIGIN = 'https://huangguoai.com'
const SCOPE = 'playback'
const PROTOCOL = 'dx150-edge-v1'
const MAX_SEQUENCE = 16384

const api = new Api({
  proxyMode: 'Custom',
  proxyHost: '127.0.0.1',
  proxyPort: '7890'
})

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** P-256 raw 公钥（65 字节非压缩点）→ KeyObject（拼 SPKI 头后导入） */
const SPKI_P256_PREFIX = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200',
  'hex'
)
function importRawPublicKey(raw) {
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_P256_PREFIX, raw]),
    format: 'der',
    type: 'spki'
  })
}

/** GCM 附加认证数据：info\n方向\n序列\n时间戳 */
function buildAad(info, direction, seq, ts) {
  return Buffer.from([info, direction, seq, ts].join('\n'))
}

/** POST 加密端点外层信封；session_expired 时丢弃本地会话（下次调用自动重握手） */
async function postEnvelope(envelope) {
  const resp = await api.rawRequest('POST', {
    url: `${SITE_ORIGIN}/api/${SCOPE}/request`,
    headers: {
      'Content-Type': 'application/json',
      Accept: '*/*',
      Origin: SITE_ORIGIN,
      Referer: `${SITE_ORIGIN}/`,
      // api.js 公共头是导航语义（sec-fetch-site: none），与带 Origin 的 POST 组合会被判 origin_denied，
      // 按浏览器真实 fetch 语义覆盖
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    },
    data: envelope
  })
  if (resp.status !== 200) {
    const err = resp.data?.error
    if (err === 'session_expired') session = null
    throw new Error(`加密通道 HTTP ${resp.status}${err ? ` (${err})` : ''}`)
  }
  return resp.data
}

let session = null
let pendingHello = null

/** 握手并建立会话（派生加解密密钥，缓存至过期） */
async function openSession() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const clientPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-65)

  const hello = await postEnvelope({ v: 1, type: 'hello', client_pub: b64url(clientPub) })
  if (
    hello?.type !== 'hello' ||
    typeof hello.kid !== 'string' ||
    typeof hello.sid !== 'string' ||
    !Number.isSafeInteger(hello.server_time) ||
    !Number.isSafeInteger(hello.expires_at)
  ) {
    throw new Error('加密握手响应无效')
  }
  const salt = unb64url(hello.salt)
  if (salt.length !== 32) throw new Error('加密握手响应无效')

  const shared = crypto.diffieHellman({
    privateKey,
    publicKey: importRawPublicKey(unb64url(hello.server_pub))
  })
  const info = [PROTOCOL, SCOPE, hello.site, hello.kid, hello.sid].join('\n')
  const deriveKey = (direction) =>
    Buffer.from(crypto.hkdfSync('sha256', shared, salt, Buffer.from(`${info}\n${direction}`), 32))

  const now = Math.floor(Date.now() / 1000)
  session = {
    info,
    kid: hello.kid,
    sid: hello.sid,
    clockOffset: hello.server_time - now,
    expiresAt: now + (hello.expires_at - hello.server_time),
    visitorId: crypto.randomBytes(16).toString('hex'),
    sequence: 0,
    requestKey: deriveKey('req'),
    responseKey: deriveKey('res')
  }
  return session
}

async function getSession() {
  const now = Math.floor(Date.now() / 1000)
  if (session && session.expiresAt > now + 5 && session.sequence < MAX_SEQUENCE) {
    return session
  }
  if (!pendingHello) {
    pendingHello = openSession().finally(() => {
      pendingHello = null
    })
  }
  return pendingHello
}

/**
 * 调用加密业务接口，返回解密后的业务 JSON（如 { data: { streams, cdn } }）
 * @param {string} path 业务路径，如 /api/videos/12560/episodes/2/playback
 * @param {object} body 业务参数
 */
async function edgeCall(path, body = {}, retried = false) {
  const sess = await getSession()
  const seq = ++sess.sequence
  const ts = Math.floor(Date.now() / 1000) + sess.clockOffset
  // IV 固定 12 字节，序列号写末 4 字节大端
  const iv = Buffer.alloc(12)
  iv.writeUInt32BE(seq, 8)

  const request = {
    method: 'POST',
    path,
    body: Buffer.from(JSON.stringify(body || {})).toString('base64'),
    content_type: 'application/json',
    visitor_id: sess.visitorId
  }
  const cipher = crypto.createCipheriv('aes-256-gcm', sess.requestKey, iv)
  cipher.setAAD(buildAad(sess.info, 'req', seq, ts))
  // WebCrypto 的 GCM 密文 = 密文 + 16 字节认证标签，Node 拼接顺序一致
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify({ request }))),
    cipher.final(),
    cipher.getAuthTag()
  ])

  let envelope
  try {
    envelope = await postEnvelope({
      v: 1,
      type: 'call',
      kid: sess.kid,
      sid: sess.sid,
      seq,
      ts,
      ciphertext: b64url(ciphertext)
    })
  } catch (e) {
    // 会话过期被服务端判失效：重握手后重试一次
    if (!retried && session === null) return edgeCall(path, body, true)
    throw e
  }
  if (!envelope || envelope.type !== 'result' || envelope.sid !== sess.sid || envelope.seq !== seq) {
    throw new Error(`加密接口响应异常: ${JSON.stringify(envelope).slice(0, 120)}`)
  }

  const raw = unb64url(envelope.ciphertext)
  const decipher = crypto.createDecipheriv('aes-256-gcm', sess.responseKey, iv)
  decipher.setAAD(buildAad(sess.info, 'res', seq, ts))
  decipher.setAuthTag(raw.subarray(-16))
  const plain = Buffer.concat([decipher.update(raw.subarray(0, -16)), decipher.final()])
  const inner = JSON.parse(plain.toString('utf8'))
  if (inner.status !== 200) throw new Error(`业务接口 HTTP ${inner.status}`)
  return JSON.parse(Buffer.from(inner.body, 'base64').toString('utf8'))
}

export default { edgeCall }

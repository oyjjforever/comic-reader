import { Buffer } from 'buffer';
import { generateSignHeaders } from './sign';
import { randomBytes, gzip } from './crypto';
import { httpReq } from './http';
import { md5Hex } from './md5';
import { ttEncrypt, encryptRegisterKeyRequest, decryptRegisterKey } from './deviceCrypto';

/**
 * 番茄移动端接口（自 fq-reader-chrome src/shared/api/mobileApi.ts 移植，
 * 原始实现对齐 fqapp rust/src/device/register.rs）。
 * 移植适配：chrome.storage.local 会话持久化 → kv 存储适配器
 * （由 fanqie/index.ts 注入应用 sqlite kv；默认内存实现，诊断脚本可纯 Node 运行）；
 * 去掉小说正文通道（batch_full/mget，短剧不需要）。
 */

export interface KvStore {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
}

const memoryKv: KvStore = {
    async get() { return undefined; },
    async set() { /* no-op */ }
};

let kvStore: KvStore = memoryKv;

/** 注入持久化 kv（sqlite appData）；不注入则仅内存会话 */
export function setKvStore(store: KvStore): void {
    kvStore = store;
}

interface MobileSession {
    device: {
        deviceId: string;
        iid: string;
        secretKey: string; // HEX 大写（registerkey 产物；短剧链路不依赖）
        cdid: string;
        openudid: string;
    };
    updatedAt: number;
}

const SESSION_STORAGE_KEY = 'fqMobileSession';

const REGISTER_HOSTS = [
    'https://log.snssdk.com',
    'https://log.isnssdk.com',
    'https://log5-applog.fqnovel.com'
];

const PKG_NAME = 'com.dragon.read';
const SDK_VERSION = 'v04.04.05-ov-android';
const DEFAULT_UA = 'com.dragon.read/66732 (Linux; U; Android 10; zh_CN; Pixel 4 XL; Build/QD1A.190821.007;tt-ok/3.12.13.4-tiktok)';

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function uuidV4(): string {
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function randomAlnum(n: number): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let s = '';
    const r = randomBytes(n);
    for (let i = 0; i < n; i++) { s += chars[r[i] % chars.length]; }
    return s;
}

function randomHexLower(n: number): string {
    return randomBytes(n).toString('hex').slice(0, n);
}

function randMac(): string {
    const hex = '0123456789ABCDEF';
    const r = randomBytes(12);
    const parts: string[] = [];
    for (let i = 0; i < 6; i++) {
        parts.push(hex[r[i * 2] % 16] + hex[r[i * 2 + 1] % 16]);
    }
    return parts.join(':');
}

/** Go 风格 query 转义（空格→+，非保留字符集 A-Za-z0-9-_.~） */
function goQueryEscape(s: string): string {
    let out = '';
    for (const ch of Buffer.from(s, 'utf8')) {
        if ((ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a) || (ch >= 0x30 && ch <= 0x39) ||
            ch === 0x2d || ch === 0x5f || ch === 0x2e || ch === 0x7e) {
            out += String.fromCharCode(ch);
        } else if (ch === 0x20) {
            out += '+';
        } else {
            out += '%' + ch.toString(16).toUpperCase().padStart(2, '0');
        }
    }
    return out;
}

function sortedQuery(params: Array<[string, string]>): string {
    return [...params]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `${goQueryEscape(k)}=${goQueryEscape(v)}`)
        .join('&');
}

/** fqapp crypto.rs gzip：字节 8/9 修补为 Android zlib 形态 */
async function fqGzip(data: Buffer): Promise<Buffer> {
    const gz = await gzip(data);
    gz[8] = 2;
    gz[9] = 3;
    return gz;
}

// ---------------------------------------------------------------------------
// MobileApi
// ---------------------------------------------------------------------------

export class MobileApi {
    private session: MobileSession | undefined;
    private initialized = false;
    private failCount = 0;
    private cooldownUntil = 0;

    isAvailable(): boolean {
        return Date.now() >= this.cooldownUntil;
    }

    /** 诊断/重试场景：清除熔断冷却 */
    resetCooldown(): void {
        this.failCount = 0;
        this.cooldownUntil = 0;
    }

    /** 丢弃当前会话（resetDevice 用），下次请求重新注册 */
    invalidateSession(): void {
        this.session = undefined;
        this.initialized = false;
    }

    private markFailure(): void {
        this.failCount++;
        if (this.failCount >= 2) {
            this.cooldownUntil = Date.now() + 30 * 60 * 1000;
            this.failCount = 0;
        }
    }

    private markSuccess(): void {
        this.failCount = 0;
        this.cooldownUntil = 0;
    }

    /** 从 kv 恢复会话（幂等） */
    async init(): Promise<void> {
        if (this.initialized) { return; }
        this.initialized = true;
        try {
            const raw = await kvStore.get(SESSION_STORAGE_KEY);
            if (!raw) { return; }
            const parsed = JSON.parse(raw) as MobileSession;
            if (parsed && parsed.device && /^\d+$/.test(parsed.device.deviceId)) {
                this.session = parsed;
            }
        } catch { /* 重建 */ }
    }

    private async persist(): Promise<void> {
        if (!this.session) { return; }
        this.session.updatedAt = Date.now();
        try {
            await kvStore.set(SESSION_STORAGE_KEY, JSON.stringify(this.session));
        } catch { /* 持久化失败不阻塞 */ }
    }

    hasDevice(): boolean {
        return !!this.session?.device.deviceId;
    }

    /** 当前会话信息（诊断用，不含密钥明文） */
    async status(): Promise<{ registered: boolean; cooldown: boolean; deviceId?: string }> {
        await this.init();
        return {
            registered: this.hasDevice(),
            cooldown: !this.isAvailable(),
            deviceId: this.session?.device.deviceId
        };
    }

    /** 确保设备可用（无设备时注册），返回设备标识 */
    async ensureDevice(): Promise<{ deviceId: string; iid: string }> {
        await this.init();
        if (!this.hasDevice()) {
            await this.registerDevice();
        }
        return { deviceId: this.session!.device.deviceId, iid: this.session!.device.iid };
    }

    /**
     * 通用设备签名 JSON 请求（fqapp UpstreamClient::do_resp 等价）：
     * URL 占位符 {device_id}/{install_id}/{cdid}/{openudid} 先替换再签名。
     */
    async signedJsonRequest<T = unknown>(
        urlTemplate: string,
        bodyObj: unknown | null,
        extraHeaders: Record<string, string> = {}
    ): Promise<T> {
        const dev = await this.ensureDevice();
        const device = { ...this.session!.device };
        const url = urlTemplate
            .replace(/\{device_id\}/g, dev.deviceId)
            .replace(/\{install_id\}/g, dev.iid)
            .replace(/\{cdid\}/g, device.cdid)
            .replace(/\{openudid\}/g, device.openudid || dev.deviceId);
        const query = new URL(url).search.slice(1);
        const body = bodyObj === null ? null : Buffer.from(JSON.stringify(bodyObj), 'utf8');
        const headers: Record<string, string> = {
            ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
            ...extraHeaders,
            ...generateSignHeaders(query, body)
        };
        const method = body ? 'POST' : 'GET';
        const resp = await httpReq(method, url, headers, body ?? undefined);
        if (resp.status !== 200) {
            this.markFailure();
            throw new Error(`HTTP ${resp.status}: ${resp.body.toString('utf8').slice(0, 80)}`);
        }
        if (resp.body.length === 0) {
            this.markFailure();
            throw new Error(`HTTP 200 但响应为空（${new URL(url).host} 可能已风控本设备/IP）`);
        }
        this.markSuccess();
        return JSON.parse(resp.body.toString('utf8')) as T;
    }

    // ---- 注册（fqapp Registrar::register 四步流程）----

    private devInfo(): Record<string, string> {
        return {
            device_type: 'MI 12',
            os_api: '29',
            os_version: '10',
            openudid: randomHexLower(16),
            resolution: '1440*2392',
            dpi: '560',
            cdid: uuidV4(),
            clientudid: uuidV4(),
            device_brand: 'Xiaomi',
            channel: 'xiaomi_1967_64',
            version_code: '65132',
            version_name: '6.5.1.32',
            manifest_version_code: '65132',
            update_version_code: '65132'
        };
    }

    private devUserAgent(di: Record<string, string>): string {
        return (
            `com.dragon.read/${di.manifest_version_code} (Linux; U; Android ${di.os_version}; zh_CN; ` +
            `${di.device_type}; Build/MMB29M; Cronet/TTNetVersion:9ac8d95c 2024-11-25 QuicVersion:3f326df4 2024-11-14)`
        );
    }

    private devUrlParams(di: Record<string, string>, extra: Array<[string, string]> = []): Array<[string, string]> {
        const p: Array<[string, string]> = [
            ['tt_data', 'a'], ['os_api', di.os_api], ['device_type', di.device_type], ['ssmix', 'a'],
            ['manifest_version_code', di.manifest_version_code], ['dpi', di.dpi],
            ['version_name', di.version_name], ['ts', String(Math.floor(Date.now() / 1000))],
            ['cpu_support64', 'true'], ['app_type', 'normal'], ['appTheme', 'light'], ['ac', 'wifi'],
            ['host_abi', 'arm64-v8a'], ['update_version_code', di.update_version_code],
            ['channel', di.channel], ['_rticket', String(Date.now())],
            ['device_platform', 'android'], ['version_code', di.version_code],
            ['cdid', di.cdid], ['os', 'android'], ['is_android_pad', '0'],
            ['openudid', di.openudid], ['package', PKG_NAME], ['resolution', di.resolution],
            ['os_version', di.os_version], ['language', 'zh'], ['device_brand', di.device_brand],
            ['need_personal_recommend', '1'], ['aid', '1967'], ['minor_status', '0'],
            ['app_name', 'novel'], ['mcc_mnc', '46007']
        ];
        for (const [k, v] of extra) {
            const idx = p.findIndex(([pk]) => pk === k);
            if (idx >= 0) { p[idx] = [k, v]; } else { p.push([k, v]); }
        }
        return p;
    }

    private async deviceRegister(di: Record<string, string>, host: string): Promise<{ deviceId: string; iid: string }> {
        const gtime = Date.now();
        const rom = 'EMUI-' + randomAlnum(13);
        const header = {
            display_name: 'fq-reader',
            update_version_code: di.update_version_code,
            manifest_version_code: di.manifest_version_code,
            aid: 1967,
            channel: di.channel,
            package: PKG_NAME,
            app_version: di.version_name,
            version_code: di.version_code,
            sdk_version: SDK_VERSION,
            sdk_target_version: 29,
            os: 'Android',
            os_version: di.os_version,
            os_api: di.os_api,
            device_model: di.device_type,
            device_brand: di.device_brand,
            device_manufacturer: 'Google',
            device_category: 'phone',
            cpu_abi: 'arm64-v8a',
            release_build: uuidV4(),
            density_dpi: di.dpi,
            display_density: 'mdpi',
            resolution: di.resolution.replace('*', 'x'),
            language: 'zh',
            mac: randMac(),
            timezone: 8,
            access: 'wifi',
            not_request_sender: 0,
            carrier: 'CHINA MOBILE',
            mcc_mnc: '46007',
            rom,
            rom_version: randomAlnum(2),
            sig_hash: md5Hex(uuidV4()),
            openudid: di.openudid,
            clientudid: di.clientudid,
            sim_serial_number: [],
            region: 'CN',
            tz_name: 'Asia/Shanghai',
            tz_offset: 28800,
            sim_region: 'cn'
        };
        const json = Buffer.from(JSON.stringify({ magic_tag: 'ss_app_log', header, _gen_time: gtime }), 'utf8');
        const post = ttEncrypt(await fqGzip(json));
        const qs = sortedQuery(this.devUrlParams(di));
        const resp = await httpReq('POST', `${host}/service/2/device_register/?${qs}`, {
            'content-type': 'application/octet-stream;tt-data=a',
            'accept-encoding': 'gzip',
            'user-agent': this.devUserAgent(di),
            connection: 'Keep-Alive'
        }, post);
        if (resp.status !== 200) { throw new Error(`HTTP ${resp.status}`); }
        if (resp.body.length === 0) { throw new Error(`device_register 响应为空（${host} 可能已风控本 IP）`); }
        const rd = JSON.parse(resp.body.toString('utf8')) as Record<string, unknown>;
        const pick = (keys: string[]): string => {
            for (const k of keys) {
                const v = rd[k];
                if (typeof v === 'string' && v) { return v; }
                if (typeof v === 'number' && v > 0) { return String(v); }
            }
            return '';
        };
        const deviceId = pick(['device_id_str', 'device_id']);
        const iid = pick(['install_id_str', 'install_id']);
        if (!deviceId || !iid) {
            throw new Error(`device_register 响应异常: ${resp.body.toString('utf8').slice(0, 80)}`);
        }
        return { deviceId, iid };
    }

    private async appAlertCheck(di: Record<string, string>, deviceId: string, iid: string): Promise<void> {
        const params = this.devUrlParams(di, [['device_id', deviceId], ['iid', iid]]);
        const query = sortedQuery(params);
        const url = `https://ichannel.snssdk.com/service/2/app_alert_check/?${query}`;
        const headers: Record<string, string> = {
            'content-type': 'application/octet-stream;tt-data=a',
            'accept-encoding': 'gzip',
            'log-encode-type': 'gzip',
            'x-tt-request-tag': 't=0;n=1',
            'x-ss-req-ticket': String(Date.now()),
            'sdk-version': '2',
            'passport-sdk-version': di.version_code,
            'x-vc-bdturing-sdk-version': '3.7.4.cn',
            'user-agent': this.devUserAgent(di),
            connection: 'Keep-Alive'
        };
        Object.assign(headers, generateSignHeaders(query, null));
        try { await httpReq('GET', url, headers); } catch { /* 结果可忽略（fqapp 同样忽略） */ }
    }

    private async activatePremium(deviceId: string, iid: string, deviceType: string): Promise<void> {
        const parts = [
            'aid=1967', 'app_name=novelapp', 'channel=0', `device_id=${deviceId}`,
            'device_platform=android', `device_type=${deviceType}`, `iid=${iid}`,
            'os_version=0', 'version_code=61532', 'version_name=6.1.5.32',
            'manifest_version_code=61532', 'update_version_code=61532'
        ].sort();
        const url = `https://api5-normal-sinfonlinea.fqnovel.com/reading/user/privilege/add/v/?${parts.join('&')}`;
        const body = Buffer.from(JSON.stringify({
            add_count_daily: 0,
            amount: 2592000,
            privilege_id: 7210376203117531962,
            from: 8,
            unique_key: String(Date.now())
        }), 'utf8');
        try {
            await httpReq('POST', url, { 'user-agent': DEFAULT_UA, 'content-type': 'application/json' }, body);
        } catch { /* 结果可忽略 */ }
    }

    private async registerKey(deviceId: string, iid: string): Promise<string> {
        const content = encryptRegisterKeyRequest(deviceId);
        const parts = [
            'aid=1967', 'app_name=novelapp', 'channel=0', `device_id=${deviceId}`,
            'device_platform=android', `iid=${iid}`, 'os_version=0',
            'version_code=6.1.5.32', 'version_name=6.1.5.32'
        ].sort();
        const paramString = parts.join('&');
        const url = `https://reading.snssdk.com/reading/crypt/registerkey?${paramString}`;
        const compressed = await fqGzip(Buffer.from(JSON.stringify({ content }), 'utf8'));

        let lastErr = '';
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const headers: Record<string, string> = {
                    'User-Agent': 'com.dragon.read',
                    'Content-Encoding': 'gzip'
                };
                Object.assign(headers, generateSignHeaders(paramString, compressed, { enableGorgon: true }));
                const resp = await httpReq('POST', url, headers, compressed);
                if (resp.status !== 200) {
                    lastErr = `HTTP ${resp.status}`;
                    await new Promise((r) => setTimeout(r, 1000));
                    continue;
                }
                const rd = JSON.parse(resp.body.toString('utf8')) as { data?: { key?: string } };
                const key = rd.data?.key;
                if (!key) {
                    lastErr = `missing key: ${resp.body.toString('utf8').slice(0, 80)}`;
                    await new Promise((r) => setTimeout(r, 1000));
                    continue;
                }
                return decryptRegisterKey(key);
            } catch (e) {
                lastErr = e instanceof Error ? e.message : String(e);
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
        throw new Error(`registerkey 失败: ${lastErr}`);
    }

    /** 完整注册（fqapp 四步）。成功后设备与 secret_key 持久化。 */
    async registerDevice(): Promise<void> {
        let lastErr = '';
        for (const host of REGISTER_HOSTS) {
            const di = this.devInfo();
            try {
                const { deviceId, iid } = await this.deviceRegister(di, host);
                await this.appAlertCheck(di, deviceId, iid);
                await new Promise((r) => setTimeout(r, 2000));
                await this.activatePremium(deviceId, iid, di.device_type);
                let secretKey = '';
                try {
                    secretKey = await this.registerKey(deviceId, iid);
                } catch (e) {
                    secretKey = ''; // fqapp：密钥失败设备仍可用（短剧链路不依赖）
                    lastErr = e instanceof Error ? e.message : String(e);
                }
                this.session = {
                    device: {
                        deviceId, iid, secretKey,
                        cdid: di.cdid, openudid: di.openudid
                    },
                    updatedAt: Date.now()
                };
                await this.persist();
                return;
            } catch (e) {
                lastErr = e instanceof Error ? e.message : String(e);
            }
        }
        this.markFailure();
        throw new Error(`设备注册被拒（${lastErr}）。可能当前 IP 被风控。`);
    }

    /** 重置设备：清空会话与冷却并立即重新注册 */
    async resetDevice(): Promise<void> {
        this.invalidateSession();
        this.resetCooldown();
        try {
            await kvStore.set(SESSION_STORAGE_KEY, '');
        } catch { /* 忽略 */ }
        this.initialized = true;
        await this.registerDevice();
    }
}

export const mobileApi = new MobileApi();

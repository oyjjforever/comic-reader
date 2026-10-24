import { Buffer } from 'buffer';
import { mobileApi } from './mobileApi';
import { generateSignHeaders } from './sign';
import { mp4NeedsCencDecrypt, decryptCencMp4 } from './cenc';
import { httpReq, downloadBuffer } from './http';
import { sha512Buf, aesCbcDecrypt } from './crypto';
import { pkcs7Unpad } from './crypto';
import { fetchMobileCatalog } from './catalog';
import { putDramaEpisode, hasDramaEpisode, getDramaCodec, getDramaPath } from './cache';

/**
 * 短剧 API（自 fq-reader-chrome src/shared/api/drama.ts 移植，
 * 源自 fqapp video.rs）：剧集目录（all_items）→ video_model（shortplay 主 +
 * phoenix 补档）→ spade URL 解密（两种形态）→ 内容密钥推导 → 下载 →
 * CENC 解密 → 文件缓存（putDramaEpisode，IndexedDB 改为本地文件）。
 */

const SPADE_CONSTANTS = Buffer.from([
    77, 212, 194, 230, 184, 49, 98, 9, 14, 82, 179, 199, 166, 115, 59, 164, 28, 178, 70, 43, 130,
    154, 181, 138, 25, 107, 57, 219, 87, 23, 117, 36, 244, 155, 175, 127, 8, 232, 214, 141, 38,
    167, 46, 55, 193, 169, 90, 47, 31, 5, 165, 24, 146, 174, 242, 148, 151, 50, 182, 42, 56, 170,
    221, 88,
]);

function b64d(s: string): Buffer {
    let t = String(s ?? '').trim();
    t += '='.repeat((4 - (t.length % 4)) % 4);
    return Buffer.from(t.replace(/[\r\n]/g, ''), 'base64');
}

function bitCount(n: number): number {
    let c = 0, v = n >>> 0;
    while (v) { c += v & 1; v = v >>> 1; }
    return c;
}

/** fqapp decrypt_spade_url：两种 main_url 形态（base64 明文 / spade 密文） */
function decryptSpadeUrl(value: string, keySeed: Buffer): string {
    if (!value) { return ''; }
    let rawUrl = value;
    if (rawUrl && !rawUrl.startsWith('http')) {
        try {
            const dec = b64d(rawUrl);
            if (dec.subarray(0, 4).toString('latin1') === 'http') {
                rawUrl = dec.toString('utf8');
            }
        } catch { /* 走 spade */ }
    }
    let raw: Buffer;
    try { raw = b64d(rawUrl); } catch { return rawUrl; }
    if (raw.length < 5 || raw[0] !== 168 || raw[2] !== 1 || raw[3] !== 0) { return rawUrl; }
    let cipher = raw.subarray(4);
    cipher = cipher.subarray(0, Math.floor(cipher.length / 16) * 16);
    if (!cipher.length) { return rawUrl; }
    const h1 = sha512Buf(keySeed);
    const h2 = sha512Buf(Buffer.concat([h1, SPADE_CONSTANTS]));
    try {
        return pkcs7Unpad(aesCbcDecrypt(cipher, h2.subarray(0, 16), h2.subarray(16, 32)))
            .toString('utf8').replace(/\0+$/, '');
    } catch {
        return '';
    }
}

/** fqapp derive_spade_content_key */
function deriveSpadeContentKey(value: string): Buffer {
    if (!value) { return Buffer.alloc(0); }
    let raw: Buffer;
    try { raw = b64d(value); } catch { return Buffer.alloc(0); }
    if (raw.length < 3) { return Buffer.alloc(0); }
    const outLen = raw.length - ((raw[0] ^ raw[1] ^ raw[2]) - 0x2f);
    if (outLen < 33 || outLen + 1 > raw.length) { return Buffer.alloc(0); }
    const buf = Buffer.from(raw.subarray(1, 1 + outLen));
    const src = Buffer.from(buf);
    let prevA = 0x55, prevB = 0xf6;
    for (let i = 0; i < src.length; i++) {
        const cur = src[i];
        let keep;
        if (i & 1) { keep = cur; } else { keep = prevA; prevA = prevB; prevB = cur; }
        buf[i] = ((((prevA ^ cur) - bitCount(i) - 0x15) & 0xff) + 0x100) & 0xff;
        prevA = keep;
    }
    try {
        const key = Buffer.from(buf.subarray(1, 33).toString('utf8'), 'hex');
        return key.length === 16 ? key : Buffer.alloc(0);
    } catch {
        return Buffer.alloc(0);
    }
}

// ---------------------------------------------------------------------------
// 剧集目录
// ---------------------------------------------------------------------------

export interface DramaEpisode {
    videoId: string;
    title: string;
    version: string;
}

const episodeCache = new Map<string, DramaEpisode[]>();

export async function fetchDramaEpisodes(seriesId: string): Promise<DramaEpisode[]> {
    const hit = episodeCache.get(seriesId);
    if (hit) { return hit; }
    const catalog = await fetchMobileCatalog(seriesId);
    const episodes = catalog.map((c) => ({ videoId: c.itemId, title: c.title || '', version: c.version }));
    episodeCache.set(seriesId, episodes);
    return episodes;
}

// ---------------------------------------------------------------------------
// 选流与下载
// ---------------------------------------------------------------------------

interface VariantInfo {
    name: string;
    codec: string;
    resolution: number;
    mainUrl: string;
    spadeA: string;
}

function variantScore(v: { codec: string; resolution: number }): number | null {
    // bytevc2/h266 无解码路径，永不入选；H.264 同档优先（fqapp video_quality_score）
    if (/bytevc2|h266/i.test(v.codec)) { return null; }
    return v.resolution * 10 + (/h264|avc/i.test(v.codec) ? 5 : 0);
}

function collectVariants(videoList: unknown, keySeed: Buffer | null, out: VariantInfo[]): void {
    if (!videoList || typeof videoList !== 'object') { return; }
    const entries = Array.isArray(videoList)
        ? videoList.map((v, i) => [String(i), v] as [string, unknown])
        : Object.entries(videoList as Record<string, unknown>);
    for (const [name, v] of entries) {
        const info = v as Record<string, unknown>;
        const mainUrl = String(info.main_url ?? info.backup_url_1 ?? '');
        if (!mainUrl) { continue; }
        let url = mainUrl;
        if (keySeed) { url = decryptSpadeUrl(url, keySeed); }
        if (!url.startsWith('http')) { continue; }
        const resoStr = String(info.resolution ?? info.definition ?? '');
        let resolution = parseInt(resoStr.replace(/\D/g, ''), 10) || 0;
        if (info.height && Number(info.height) > resolution) { resolution = Number(info.height); }
        out.push({
            name,
            codec: String(info.codec_type ?? ''),
            resolution,
            mainUrl: url,
            spadeA: String(info.spade_a ?? '')
        });
    }
}

async function fetchShortplayModel(videoId: string): Promise<VariantInfo[]> {
    const dev = await mobileApi.ensureDevice();
    const url =
        'https://api3-normal-sinfonlinea.fqnovel.com/novel/player/video_model/v1/' +
        `?iid=${dev.iid}&device_id=${dev.deviceId}` +
        '&aid=1967&app_name=novelapp&version_code=72132&version_name=7.2.1.32' +
        '&device_platform=android&device_brand=Xiaomi&os_version=13&cdid=5566b484-82f9-4cef-880d-60ca354e6a99';
    const body = {
        video_id: videoId,
        content_type: 1004,
        biz_param: {
            detail_page_version: 0, device_level: 3, disable_digg_stat: false,
            disable_video_relate_book: false, from_video_id: '', need_all_video_definition: true,
            need_mp4_align: false, source: 4, use_os_player: false, use_server_dns: false,
            video_platform: 3
        }
    };
    const json = await mobileApi.signedJsonRequest<{ data?: { video_model?: unknown } }>(url, body, {
        'User-Agent': 'com.dragon.read'
    });
    let model = json.data?.video_model;
    if (typeof model === 'string') {
        try { model = JSON.parse(model); } catch { model = null; }
    }
    const m = model as { key_seed?: string; video_list?: unknown } | null;
    if (!m?.video_list) { return []; }
    const keySeed = m.key_seed ? b64d(m.key_seed) : null;
    const out: VariantInfo[] = [];
    collectVariants(m.video_list, keySeed, out);
    return out;
}

async function fetchPhoenixModel(videoId: string): Promise<VariantInfo[]> {
    const dev = await mobileApi.ensureDevice();
    const url =
        'https://api5-normal-sinfonlineb.fqnovel.com/novel/player/multi_video_model/v1/' +
        `?iid=${dev.iid}&device_id=${dev.deviceId}` +
        '&ac=wifi&channel=update_64&aid=8662&app_name=novelread&version_code=71332&version_name=7.1.3.32' +
        '&device_platform=android&os=android&ssmix=a&device_type=25053RT47C&device_brand=Redmi&language=zh' +
        '&os_api=36&os_version=16&manifest_version_code=71332&resolution=1280*2772&dpi=520' +
        '&update_version_code=71332&host_abi=arm64-v8a&dragon_device_type=phone&pv_player=71332' +
        '&compliance_status=0&need_personal_recommend=1&player_so_load=1&is_android_pad_screen=0';
    const body = {
        biz_param: {
            detail_page_version: 0, device_level: 3, disable_digg_stat: false,
            need_all_video_definition: true, need_mp4_align: false, use_os_player: false,
            use_server_dns: false, video_platform: 1024
        },
        mixed_video_id_map: { '1004': [videoId] }
    };
    const json = await mobileApi.signedJsonRequest<Record<string, unknown>>(url, body, {
        'User-Agent': 'com.dragon.read',
        'x-ss-dp': '1967'
    });
    const data = (json.data ?? {}) as Record<string, unknown>;
    const out: VariantInfo[] = [];
    for (const v of Object.values(data)) {
        if (!v || typeof v !== 'object') { continue; }
        let model = v as { video_model?: unknown; video_list?: unknown; key_seed?: string };
        if (typeof model.video_model === 'string') {
            try { model = JSON.parse(model.video_model); } catch { continue; }
        } else if (model.video_model && typeof model.video_model === 'object') {
            model = model.video_model as typeof model;
        }
        if (!model.video_list) { continue; }
        const keySeed = model.key_seed ? b64d(model.key_seed) : null;
        collectVariants(model.video_list, keySeed, out);
    }
    return out;
}

function pickBest(variants: VariantInfo[]): VariantInfo | null {
    let best: VariantInfo | null = null;
    let bestScore = -1;
    for (const v of variants) {
        const score = variantScore(v);
        if (score === null) { continue; }
        if (score > bestScore) { best = v; bestScore = score; }
    }
    return best;
}

/** 视频下载：TLS 断连/超时自动重试（CDN 节点抖动常见，间隔递增） */
async function downloadVideo(url: string, onProgress?: (got: number, total: number) => void): Promise<Buffer> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await downloadBuffer(url, onProgress);
        } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
            const retriable = /TLS|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout|超时|网络|abort|network|failed to fetch/i.test(lastErr.message);
            if (!retriable || attempt === 2) { break; }
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
    throw lastErr ?? new Error('视频下载失败');
}

// ---------------------------------------------------------------------------
// 缓存管理（本地文件）
// ---------------------------------------------------------------------------

export interface EpisodeDownloadProgress {
    stage: 'resolve' | 'download' | 'decrypt' | 'done';
    got?: number;
    total?: number;
}

export interface EpisodeResult {
    /** 缓存文件绝对路径，渲染层用 file:// 直接播放 */
    path: string;
    codec: string;
}

/** 确保某集已下载并解密，缓存于本地文件 */
export async function ensureEpisodeFile(
    seriesId: string,
    videoId: string,
    episodeIndex = 0,
    onProgress?: (p: EpisodeDownloadProgress) => void
): Promise<EpisodeResult> {
    if (hasDramaEpisode(seriesId, videoId)) {
        const hit = getDramaPath(seriesId, videoId);
        if (hit) { return { path: hit, codec: getDramaCodec(seriesId, videoId) }; }
    }

    onProgress?.({ stage: 'resolve' });
    let variants: VariantInfo[] = [];
    let modelErr = '';
    // 模型请求也可能 TLS 断连：双轮尝试
    for (let attempt = 0; attempt < 2 && variants.length === 0; attempt++) {
        try {
            variants = await fetchShortplayModel(videoId);
        } catch (e) {
            modelErr = e instanceof Error ? e.message : String(e);
            if (attempt > 0) { break; }
            await new Promise((r) => setTimeout(r, 800));
        }
    }
    let best = pickBest(variants);
    if (!best) {
        // 补档：phoenix（fqapp：shortplay 缺档/无流时的第二来源）
        try {
            variants = await fetchPhoenixModel(videoId);
            best = pickBest(variants);
        } catch (e) {
            modelErr += `；phoenix: ${e instanceof Error ? e.message : String(e)}`;
        }
    }
    if (!best) {
        // 透传真实失败原因（如 HTTP 403 风控），便于诊断
        throw new Error(modelErr ? `未解析到可播放的视频流（${modelErr.slice(0, 120)}）` : '未解析到可播放的视频流');
    }

    onProgress?.({ stage: 'download', got: 0, total: 0 });
    const raw = await downloadVideo(best.mainUrl, (got, total) => onProgress?.({ stage: 'download', got, total }));

    onProgress?.({ stage: 'decrypt' });
    let out = raw;
    if (mp4NeedsCencDecrypt(raw)) {
        const key16 = deriveSpadeContentKey(best.spadeA);
        if (key16.length !== 16) { throw new Error('内容密钥推导失败'); }
        out = decryptCencMp4(raw, key16);
    }

    const file = putDramaEpisode(seriesId, videoId, out, best.codec, episodeIndex);
    onProgress?.({ stage: 'done' });
    return { path: file, codec: best.codec };
}

// ---------------------------------------------------------------------------
// 短剧搜索（阅读版 search/tab：短剧条目只出现在这里的 tab 中）
// ---------------------------------------------------------------------------

export interface DramaSearchResult {
    bookId: string;
    title: string;
    /** 区分多季：alias（季名）· sub_title（分类·全N集） */
    subtitle?: string;
    abstract?: string;
    category?: string;
    coverUrl?: string;
    episodeCount?: number;
    /** 官方运营角标（热门/上新/爆款…），来自 tag_info */
    tagText?: string;
    /** 角标渐变色 [from, to]，来自 tag_info.bg_color */
    tagColors?: [string, string];
}

/**
 * 阅读版搜索（v0.9.15+ 接口形态）：tab_type=11 短剧 Tab。
 * 响应结构：顶层 search_tabs[]（不在 data 下），短剧条目 data[] 内嵌 video_data[0].series_id。
 * 多季区分：副标题 = alias（季名）· sub_title（分类·全N集）。
 * 翻页：offset 递增（每页 count=20），返回空数组即到底。
 * sortBy（如 publish_time）：附加分类排序参数走"分类流"形态（实测与默认推荐流排序不同）。
 */
export async function searchDramas(query: string, offset = 0, sortBy?: string): Promise<DramaSearchResult[]> {
    const dev = await mobileApi.ensureDevice();
    const rawUrl =
        'https://api5-normal-sinfonlineb.fqnovel.com/reading/bookapi/search/tab/v' +
        `?bookshelf_search_plan=4&offset=${offset}&user_is_login=1&bookstore_tab=2&passback=0&query=${encodeURIComponent(query)}` +
        '&count=20&search_source=1&clicked_content=search_history&use_lynx=false&use_correct=true&tab_type=11' +
        '&tab_name=store&pad_column_cover=0&is_first_enter_search=false&iid={install_id}&device_id={device_id}' +
        '&ac=wifi&channel=xiaomi_1967_64&aid=1967&app_name=novelapp&version_code=65132&version_name=6.5.1.32' +
        '&device_platform=android&os=android&ssmix=a&device_type=FRD-AL10&device_brand=honor&language=zh' +
        '&os_api=28&os_version=9&manifest_version_code=65132&resolution=1080%2A1920&dpi=480' +
        '&update_version_code=65132&pv_player=65132&gender=2&need_personal_recommend=1&player_so_load=1' +
        '&is_android_pad_screen=0&host_abi=arm64-v8a&dragon_device_type=phone' +
        '&rom_version=FRD-AL10%2B8.0.0.556%28C00%29&compliance_status=0' +
        // 分类排序形态（探测验证过的参数组合，追加在原有 gender 之后）
        (sortBy ? `&sort_by=${sortBy}&category_id=0&genre_type=130&gender=0` : '');
    const url = rawUrl
        .replace(/\{device_id\}/g, dev.deviceId)
        .replace(/\{install_id\}/g, dev.iid);
    const headers = { 'User-Agent': 'com.dragon.read', ...generateSignHeaders(new URL(url).search.slice(1), null) };
    const resp = await httpReq('GET', url, headers);
    if (resp.body.length === 0) {
        throw new Error('阅读版搜索无响应（接口限制）');
    }
    const json = JSON.parse(resp.body.toString('utf8')) as {
        search_tabs?: Array<{ tab_name?: string; tab_type?: unknown; title?: unknown; data?: unknown }>;
    };
    const tabs = (json.search_tabs ?? []) as Array<{ tab_type?: unknown; title?: unknown; data?: unknown }>;
    const out = new Map<string, DramaSearchResult>();
    for (const tab of tabs) {
        const t = Number(tab.tab_type);
        if (Number.isFinite(t) && t > 0 && t !== 11) { continue; }
        if (!Number.isFinite(t) && String(tab.title ?? '') !== '短剧') { continue; }
        const list = Array.isArray(tab.data) ? (tab.data as Array<Record<string, unknown>>) : [];
        for (const item of list) {
            const vd = Array.isArray(item.video_data)
                ? (item.video_data as Array<Record<string, unknown>>)[0]
                : undefined;
            const bookId = String((vd && (vd.series_id_str ?? vd.pseries_id ?? vd.series_id)) ?? item.book_id ?? '');
            if (!bookId || out.has(bookId)) { continue; }
            const hl = (item.search_high_light as { title?: { text?: string } } | undefined)?.title?.text;
            const title = String(hl ?? vd?.title ?? '').replace(/<[^>]+>/g, '');
            if (!title) { continue; }
            const subBits: string[] = [];
            const alias = String(vd?.alias_name ?? '').trim();
            const subTitle = String(vd?.sub_title ?? '').trim();
            if (alias && alias !== title) { subBits.push(alias); }
            if (subTitle) { subBits.push(subTitle); }
            const epCnt = Number(vd?.episode_cnt ?? 0);
            if (epCnt > 0 && !subTitle.includes('集')) { subBits.push(`全${epCnt}集`); }
            // 封面：video_data[0].cover 是带 x-signature 的直链（长效签名，任意 UA 可访问）
            const coverUrl = String(vd?.cover ?? vd?.horiz_cover ?? '') || '';
            // 完整简介优先（video_detail.series_intro），兜底 abstract
            const intro = String(
                (vd?.video_detail as { series_intro?: string } | undefined)?.series_intro ?? ''
            ) || (item.abstract ? String(item.abstract).slice(0, 200) : '');
            const sTag = vd?.tag_info as { text?: unknown; bg_color?: unknown } | undefined;
            const sTagText = sTag && typeof sTag.text === 'string' ? sTag.text : '';
            const sBgc = Array.isArray(sTag?.bg_color) ? (sTag!.bg_color as unknown[]) : [];
            out.set(bookId, {
                bookId,
                title,
                subtitle: subBits.join(' · '),
                abstract: intro,
                category: '短剧',
                coverUrl,
                episodeCount: epCnt > 0 ? epCnt : undefined,
                tagText: sTagText || undefined,
                tagColors: sBgc.length >= 2 && typeof sBgc[0] === 'string' && typeof sBgc[1] === 'string'
                    ? [sBgc[0] as string, sBgc[1] as string]
                    : undefined
            });
        }
    }
    return Array.from(out.values());
}

// ---------------------------------------------------------------------------
// 短剧详情（标题）
// ---------------------------------------------------------------------------

/** video_detail：按 series_id 取标题等信息（ID 直开时用） */
export async function fetchDramaTitle(seriesId: string): Promise<string | undefined> {
    const dev = await mobileApi.ensureDevice();
    const url =
        'https://api5-normal-sinfonlineb.fqnovel.com/novel/player/video_detail/v1/' +
        `?iid=${dev.iid}&device_id=${dev.deviceId}` +
        '&ac=wifi&channel=update_64&aid=8662&app_name=novelread&version_code=71332&version_name=7.1.3.32' +
        '&device_platform=android&os=android&ssmix=a&device_type=25053RT47C&device_brand=Redmi&language=zh' +
        '&os_api=36&os_version=16&manifest_version_code=71332&resolution=1280*2772&dpi=520' +
        '&update_version_code=71332&host_abi=arm64-v8a&dragon_device_type=phone&pv_player=71332' +
        '&compliance_status=0&need_personal_recommend=1&player_so_load=1&is_android_pad_screen=0';
    const body = {
        series_id: seriesId,
        biz_param: {
            device_level: 3,
            need_all_video_definition: true,
            need_mp4_align: false,
            source: 5,
            use_os_player: false,
            video_id_type: 1
        }
    };
    const json = await mobileApi.signedJsonRequest<Record<string, unknown>>(url, body, {
        'User-Agent': 'com.dragon.read',
        'x-ss-dp': '1967'
    });
    // series_title 是剧集名；video_list[].title 是单集简介，不能用作标题
    const findSeriesTitle = (v: unknown, depth: number): string | undefined => {
        if (depth > 3 || !v || typeof v !== 'object') { return undefined; }
        const o = v as Record<string, unknown>;
        if (typeof o.series_title === 'string' && o.series_title.length > 0) {
            return o.series_title;
        }
        for (const child of Object.values(o)) {
            const hit = findSeriesTitle(child, depth + 1);
            if (hit) { return hit; }
        }
        return undefined;
    };
    const title = findSeriesTitle(json, 0);
    return title ? title.replace(/<[^>]+>/g, '').trim() : undefined;
}

/** 预取下一集（后台静默，失败忽略） */
export function prefetchEpisode(seriesId: string, videoId: string, episodeIndex = 0): void {
    void ensureEpisodeFile(seriesId, videoId, episodeIndex).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// 漫剧首页 feed（fqapp home.rs 两段式：bookmall/tab 开 cell → cell/change 拉流）
// ---------------------------------------------------------------------------

const FQ_HOST = 'https://api5-normal-sinfonlineb.fqnovel.com';

/** fqapp reading724_params 公共参数（device/iid 由 signedGet 填充） */
function reading724Params(): Array<[string, string]> {
    return [
        ['iid', ''], ['device_id', ''], ['ac', 'wifi'], ['channel', 'xiaomi_1967_64'],
        ['aid', '1967'], ['app_name', 'novelapp'], ['version_code', '72432'],
        ['version_name', '7.2.4.32'], ['device_platform', 'android'], ['os', 'android'],
        ['ssmix', 'a'], ['device_type', '25053RT47C'], ['device_brand', 'Redmi'],
        ['language', 'zh'], ['os_api', '36'], ['os_version', '16'],
        ['manifest_version_code', '72432'], ['resolution', '1280*2620'], ['dpi', '520'],
        ['update_version_code', '72432'], ['host_abi', 'arm64-v8a'],
        ['dragon_device_type', 'phone'], ['pv_player', '72432'], ['compliance_status', '0'],
        ['need_personal_recommend', '1'], ['player_so_load', '1'],
        ['is_android_pad_screen', '0'], ['rom_version', 'miui_V816_OS3.0.9.0.WOLCNXM']
    ];
}

/** 首页/流接口共用的设备状态类参数（fqapp homepage_recommend） */
function homeExtraParams(): Array<[string, string]> {
    return [
        ['last_search_query_from_rec', 'false'], ['ClickedContent', ''], ['client_template', '0'],
        ['last_tab_index', '0'], ['screen_width_px', '1281'], ['classic_tab_style', 'v3'],
        ['first_use_category_select', 'false'], ['last_session_video_tab_type', '0'],
        ['current_name', ''], ['disable_digg_stat', 'false'], ['ecom_refresh_type', '0'],
        ['pad_column_cover', '0'], ['last_tab_type', '0'], ['req_rank_category_id', '0'],
        ['video_tab_cold_start', '0'], ['video_type_preferences_str', '[]'],
        ['auth_aweme', 'false'], ['cold_start_is_double_gd', 'false'], ['page_entry_time', '0'],
        ['cold_start_session', '1'], ['tab_index', '0'], ['lore_tab_style', 'v5'],
        ['device_level', '3'], ['unlimited_short_series_change_type', '0'], ['book_id', '0'],
        ['ecom_impression_start_time', '0'], ['enable_search_box_collapse', 'false'],
        ['landing_bottom_tab_type', '0'], ['bottom_tab_type', '0'], ['top_tab_extra', ''],
        ['migration_top_tab_enable', 'false'], ['auth_backward', 'true'], ['pad_column_detail', '0'],
        ['after_genre_preference_popup', '0'], ['client_req_type', '1'], ['req_rank_algo', '101'],
        ['unlimited_short_series_next_offset', '0'], ['normal_session_cnt_in_day', '6'],
        ['cold_start_session_cnt_in_day', '2'], ['sys_mini_window', '1'], ['app_mini_window', '0'],
        ['har_status', '0'], ['cold_start_session_cnt_in_life', '2'], ['charging', '0'],
        ['normal_session_cnt_in_life', '6'], ['is_power_save_mode', '0'], ['app_dark_mode', '0'],
        ['screen_brightness', '36'], ['battery_pct', '10'], ['down_speed', '51430'],
        ['sys_dark_mode', '0'], ['font_scale', '100'], ['network_type', '4'], ['current_volume', '0']
    ];
}

/** 签名 GET（device_id/iid 占位填充后参与签名） */
async function homeSignedGet(path: string, params: Array<[string, string]>): Promise<unknown> {
    const dev = await mobileApi.ensureDevice();
    const filled = params.map(([k, v]) =>
        [k, k === 'device_id' ? dev.deviceId : k === 'iid' ? dev.iid : v] as [string, string]);
    const qs = filled.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const url = `${FQ_HOST}${path}?${qs}`;
    const resp = await httpReq('GET', url, { 'User-Agent': 'com.dragon.read', ...generateSignHeaders(qs, null) });
    if (resp.body.length === 0) {
        throw new Error(`HTTP 200 但响应为空（${FQ_HOST} 可能已风控本设备/IP）`);
    }
    return JSON.parse(resp.body.toString('utf8'));
}

/** 深度优先找第一个命中的字符串字段（cell_id_str/session_id 等会被 JSON 序列化成 double 丢精度，必须取字符串形态） */
function firstStringField(obj: unknown, key: string, depth = 0): string {
    if (depth > 8 || !obj || typeof obj !== 'object') { return ''; }
    const o = obj as Record<string, unknown>;
    if (typeof o[key] === 'string' && (o[key] as string)) { return o[key] as string; }
    for (const v of Object.values(o)) {
        const hit = firstStringField(v, key, depth + 1);
        if (hit) { return hit; }
    }
    return '';
}

/** 递归收集含 video_data 数组的 cell 条目（首页/流响应的通用形态） */
function collectFeedCells(obj: unknown, depth: number, out: Array<Record<string, unknown>>): void {
    if (depth > 7 || !obj || typeof obj !== 'object' || out.length > 60) { return; }
    if (Array.isArray(obj)) {
        for (const v of obj) { collectFeedCells(v, depth + 1, out); }
        return;
    }
    const o = obj as Record<string, unknown>;
    if (Array.isArray(o.video_data) && (o.video_data as unknown[]).length > 0) {
        out.push(o);
    }
    for (const v of Object.values(o)) { collectFeedCells(v, depth + 1, out); }
}

/** cell 条目 → DramaSearchResult（video_data[0]） */
function mapFeedCell(cell: Record<string, unknown>): DramaSearchResult | null {
    const vd = (cell.video_data as Array<Record<string, unknown>>)[0];
    if (!vd) { return null; }
    const bookId = String(vd.series_id_str ?? vd.series_id ?? vd.pseries_id ?? '');
    const title = String(vd.title ?? '').replace(/<[^>]+>/g, '');
    if (!bookId || !title) { return null; }
    const epCnt = Number(vd.episode_cnt ?? 0);
    const sub = String(vd.sub_title ?? '').trim();
    const tag = vd.tag_info as { text?: unknown; bg_color?: unknown } | undefined;
    const tagText = tag && typeof tag.text === 'string' ? tag.text : '';
    const bgc = Array.isArray(tag?.bg_color) ? (tag!.bg_color as unknown[]) : [];
    return {
        bookId,
        title,
        subtitle: sub || (epCnt > 0 ? `全${epCnt}集` : ''),
        abstract: String(vd.video_desc ?? vd.abstract ?? '').slice(0, 200),
        category: '漫剧',
        coverUrl: String(vd.cover ?? '') || '',
        episodeCount: epCnt > 0 ? epCnt : undefined,
        tagText: tagText || undefined,
        tagColors: bgc.length >= 2 && typeof bgc[0] === 'string' && typeof bgc[1] === 'string'
            ? [bgc[0] as string, bgc[1] as string]
            : undefined
    };
}

/** 漫剧 feed 会话状态（cell + session + 游标） */
interface ManjuFeedState {
    cellId: string;
    sessionId: string;
    nextOffset: number;
    started: boolean;
}
const manjuFeed: ManjuFeedState = { cellId: '', sessionId: '', nextOffset: 0, started: false };

/** 重置漫剧 feed 会话（重新进入"最新"tab 时调用） */
export function resetManjuFeed(): void {
    manjuFeed.cellId = '';
    manjuFeed.sessionId = '';
    manjuFeed.nextOffset = 0;
    manjuFeed.started = false;
}

/** 第二段：cell/change 拉漫剧流（fqapp series_feed；session 缺失会被上游拒 101116） */
async function fetchCellFlow(offset: number): Promise<DramaSearchResult[]> {
    const params: Array<[string, string]> = [
        ...reading724Params(),
        ['cell_id', manjuFeed.cellId],
        ['tab_type', '24'],
        ['client_template', '2'],
        ['client_req_type', '2'],
        ['offset', String(offset)],
        // 首屏 ChangeFilter(2)，翻页 GetMore(1)（官方 c.java 的两个分支）
        ['unlimited_selector_change_type', offset > 0 ? '1' : '2'],
        ...homeExtraParams().filter(([k]) => !['client_template', 'client_req_type'].includes(k))
    ];
    if (manjuFeed.sessionId) { params.push(['session_id', manjuFeed.sessionId]); }
    const json = await homeSignedGet('/reading/bookapi/bookmall/cell/change/v', params) as Record<string, unknown>;
    const data = (json.data ?? {}) as Record<string, unknown>;
    const nextOffset = Number(data.next_offset ?? 0);
    if (nextOffset > offset) { manjuFeed.nextOffset = nextOffset; }
    const sid = firstStringField(data, 'session_id');
    if (sid) { manjuFeed.sessionId = sid; }
    const cells: Array<Record<string, unknown>> = [];
    collectFeedCells(data, 0, cells);
    const out: DramaSearchResult[] = [];
    const seen = new Set<string>();
    for (const cell of cells) {
        const item = mapFeedCell(cell);
        if (item && !seen.has(item.bookId)) { seen.add(item.bookId); out.push(item); }
    }
    return out;
}

/**
 * 漫剧首页 feed（"值得一看的漫剧"）：两段式，内部维护 cell/session/游标。
 * 首次调用打开 cell 并拉第一页；后续调用按 next_offset 翻页；到底返回 []。
 */
export async function fetchManjuFeed(): Promise<DramaSearchResult[]> {
    // 已开 cell：直接第二段
    if (manjuFeed.started && manjuFeed.cellId) {
        if (manjuFeed.nextOffset <= 0) { return []; }
        const items = await fetchCellFlow(manjuFeed.nextOffset);
        if (items.length === 0) { manjuFeed.nextOffset = 0; }
        return items;
    }
    // 第一段：bookmall/tab 打开漫剧 tab 的 cell
    const tabJson = await homeSignedGet('/reading/bookapi/bookmall/tab/v', [
        ...reading724Params(),
        ...homeExtraParams(),
        ['tab_type', '24'],
        ['offset', '0']
    ]) as Record<string, unknown>;
    const tabData = (tabJson.data ?? {}) as Record<string, unknown>;
    const tabItems = Array.isArray(tabData.tab_item) ? (tabData.tab_item as Array<Record<string, unknown>>) : [];
    const tab24 = tabItems.find((t) => String(t.tab_type) === '24');
    if (!tab24) { throw new Error('漫剧首页响应中未找到 tab_type=24'); }
    manjuFeed.cellId = firstStringField(tab24, 'cell_id_str');
    const sid = firstStringField(tab24, 'session_id') || firstStringField(tabJson, 'session_id');
    if (sid) { manjuFeed.sessionId = sid; }
    manjuFeed.started = true;
    // 第二段拿真正的流；失败时回退第一段 cell 条目
    const fallback: DramaSearchResult[] = [];
    const cells: Array<Record<string, unknown>> = [];
    collectFeedCells(tab24, 0, cells);
    for (const cell of cells) {
        const item = mapFeedCell(cell);
        if (item) { fallback.push(item); }
    }
    if (!manjuFeed.cellId) { return fallback; }
    try {
        const flow = await fetchCellFlow(0);
        return flow.length > 0 ? flow : fallback;
    } catch {
        return fallback;
    }
}


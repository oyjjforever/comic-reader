import axios from 'axios';
import { Buffer } from 'buffer';

/**
 * HTTP 客户端（替代 fq-reader-chrome src/shared/api/client.ts）。
 * 两层坑都不能踩：
 * 1. 全局 fetch 是 Chromium 网络栈，User-Agent 是 forbidden header 被静默丢弃；
 * 2. axios 默认适配器选择会命中 preload 环境里的 XMLHttpRequest（与 Node 共存），
 *    同样走浏览器网络栈、UA 被拒（Refused to set unsafe header "User-Agent"），
 *    字节服务端识别后返回 200 + 空 body。
 * 因此 axios 必须显式 adapter: 'http'（node:http/https），自定义 UA 才真正生效。
 */

export interface HttpResult {
    status: number;
    body: Buffer;
}

const client = axios.create({
    // 强制 Node 适配器，禁止回落到 preload 环境存在的 XHR
    adapter: 'http',
    // 状态码由调用方判断（签名接口需区分 403 风控等）
    validateStatus: () => true,
    maxRedirects: 5,
    timeout: 25000,
    // node 适配器自动解压 gzip/br 响应
    decompress: true
});

/** 通用请求（移动端签名接口用：自定义 method/UA/body） */
export async function httpReq(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer
): Promise<HttpResult> {
    const resp = await client.request({
        method,
        url,
        headers,
        data: body ? new Uint8Array(body) : undefined,
        responseType: 'arraybuffer'
    });
    return { status: resp.status, body: Buffer.from(resp.data ?? '') };
}

/** 二进制下载（视频流），带进度回调 */
export async function downloadBuffer(
    url: string,
    onProgress?: (got: number, total: number) => void
): Promise<Buffer> {
    const resp = await client.get(url, {
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 0
    });
    if (resp.status >= 400) {
        throw new Error(`视频下载 HTTP ${resp.status}`);
    }
    const total = Number(resp.headers['content-length'] ?? 0);
    const chunks: Buffer[] = [];
    let got = 0;
    for await (const chunk of resp.data) {
        const buf = Buffer.from(chunk);
        chunks.push(buf);
        got += buf.length;
        if (onProgress && total > 0) { onProgress(got, total); }
    }
    return Buffer.concat(chunks);
}

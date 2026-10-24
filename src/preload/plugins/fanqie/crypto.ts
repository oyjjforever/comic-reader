import aes from 'aes-js';
import { sha512 } from 'js-sha512';
import { Buffer } from 'buffer';
import zlib from 'node:zlib';

/**
 * 同步加密原语封装（自 fq-reader-chrome src/shared/crypto.ts 移植）：
 * - AES-CBC（无自动填充，配 pkcs7Pad/pkcs7Unpad，与 fqapp Rust 行为一致）
 * - AES-ECB 单块（CENC CTR 密钥流生成）
 * - SHA-512（js-sha512，同步）
 * - 随机字节（全局 crypto.getRandomValues）
 * gzip 部分改用 node:zlib（preload 环境保证可用，且与 CompressionStream 输出同为 RFC1952）。
 */

export function randomBytes(n: number): Buffer {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return Buffer.from(b);
}

export function sha512Buf(data: Buffer): Buffer {
    return Buffer.from(sha512.array(data));
}

/** 裸 AES-CBC 加密（不自动填充） */
export function aesCbcEncrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    const c = new aes.ModeOfOperation.cbc(key, iv);
    return Buffer.from(c.encrypt(data));
}

/** 裸 AES-CBC 解密（不自动去填充） */
export function aesCbcDecrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    const d = new aes.ModeOfOperation.cbc(key, iv);
    return Buffer.from(d.decrypt(data));
}

/** AES-ECB 单块加密（CENC 密钥流） */
export function aesEcbEncryptBlock(key: Buffer, block: Buffer): Buffer {
    const e = new aes.ModeOfOperation.ecb(key);
    return Buffer.from(e.encrypt(block));
}

// ---------------------------------------------------------------------------

export function pkcs7Pad(data: Buffer, block = 16): Buffer {
    const p = block - (data.length % block);
    return Buffer.concat([data, Buffer.alloc(p, p)]);
}

export function pkcs7Unpad(data: Buffer, block = 16): Buffer {
    if (data.length === 0 || data.length % block !== 0) { throw new Error('pkcs7: 长度非法'); }
    const p = data[data.length - 1];
    if (p < 1 || p > block || p > data.length) { throw new Error('pkcs7: 填充非法'); }
    for (let i = data.length - p; i < data.length; i++) {
        if (data[i] !== p) { throw new Error('pkcs7: 填充不匹配'); }
    }
    return data.subarray(0, data.length - p);
}

// ---------------------------------------------------------------------------

/** gzip 压缩 */
export async function gzip(data: Buffer): Promise<Buffer> {
    return zlib.gzipSync(data);
}

/** gzip 解压 */
export async function gunzip(data: Buffer): Promise<Buffer> {
    return zlib.gunzipSync(data);
}

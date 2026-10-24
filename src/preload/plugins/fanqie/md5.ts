/**
 * 纯 JS MD5 实现（Web Crypto 不提供 MD5）。
 * 签名链路（x-ss-stub / x-ladon / x-gorgon）依赖，正确性由 fq-reader-chrome
 * test/sign.test.ts 用 RFC 1321 向量与 fqapp 黄金向量双重验证。
 * （自 fq-reader-chrome src/shared/md5.ts 原样移植）
 */

/** MD5 摘要，返回 16 字节 */
export function md5(input: string | Uint8Array): Uint8Array {
    const msg = typeof input === 'string' ? utf8Bytes(input) : input;
    return new Uint8Array(md5Core(msg));
}

/** MD5 十六进制（小写） */
export function md5Hex(input: string | Uint8Array): string {
    return toHex(md5(input));
}

function utf8Bytes(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

function toHex(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) { out += b.toString(16).padStart(2, '0'); }
    return out;
}

// ---------------------------------------------------------------------------

const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
}

function rotl(x: number, c: number): number {
    return ((x << c) | (x >>> (32 - c))) >>> 0;
}

function md5Core(msg: Uint8Array): Uint8Array {
    // 填充：0x80 + 0* + 8 字节小端位长
    const bitLen = msg.length * 8;
    const padLen = ((56 - ((msg.length + 1) % 64)) + 64) % 64;
    const padded = new Uint8Array(msg.length + 1 + padLen + 8);
    padded.set(msg);
    padded[msg.length] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, bitLen >>> 0, true);
    dv.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296), true);

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let off = 0; off < padded.length; off += 64) {
        const M = new Uint32Array(16);
        for (let i = 0; i < 16; i++) {
            M[i] = dv.getUint32(off + i * 4, true);
        }
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
            let F: number, g: number;
            if (i < 16) { F = (B & C) | (~B & D); g = i; }
            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * i) % 16; }
            F = (F + A + K[i] + M[g]) >>> 0;
            A = D; D = C; C = B;
            B = (B + rotl(F, S[i])) >>> 0;
        }
        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16);
    const ov = new DataView(out.buffer);
    ov.setUint32(0, a0, true);
    ov.setUint32(4, b0, true);
    ov.setUint32(8, c0, true);
    ov.setUint32(12, d0, true);
    return out;
}

import { Buffer } from 'buffer';
import { md5, md5Hex } from './md5';
import { aesCbcEncrypt, randomBytes, sha512Buf } from './crypto';

/**
 * 番茄移动端请求签名（自 fq-reader-chrome src/shared/api/sign.ts 原样移植；
 * 原始实现为 fqapp Rust sign/* 的逐行 TS 移植）。
 * 全部原语与 fqapp rust/testdata/vectors.json 黄金向量核对：
 * sm3 / simon(keyexp+enc) / ladon / argus(bean+legacy encrypt)。
 */

// ---------------------------------------------------------------------------
// SM3（fqapp sign/sm3.rs）
// ---------------------------------------------------------------------------

const SM3_IV = [
    0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
    0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
];

function rotl32(a: number, k: number): number {
    const n = ((k % 32) + 32) % 32;
    return n === 0 ? (a >>> 0) : ((a << n) | (a >>> (32 - n))) >>> 0;
}

/** SM3 摘要（返回 32 字节） */
export function sm3(input: Buffer): Buffer {
    const len = input.length;
    const bitLenHi = Math.floor((len * 8) / 4294967296);
    const bitLenLo = (len * 8) >>> 0;
    const padded = Buffer.concat([
        input,
        Buffer.from([0x80]),
        Buffer.alloc((56 - ((len + 1) % 64) + 64) % 64),
        (() => {
            const b = Buffer.alloc(8);
            b.writeUInt32BE(bitLenHi >>> 0, 0);
            b.writeUInt32BE(bitLenLo >>> 0, 4);
            return b;
        })(),
    ]);

    let v = [...SM3_IV];
    for (let off = 0; off < padded.length; off += 64) {
        const w = new Array<number>(68).fill(0);
        for (let i = 0; i < 16; i++) {
            w[i] = padded.readUInt32BE(off + i * 4);
        }
        for (let j = 16; j < 68; j++) {
            const x = (w[j - 16] ^ w[j - 9] ^ rotl32(w[j - 3], 15)) >>> 0;
            const y = (x ^ rotl32(x, 15) ^ rotl32(x, 23)) >>> 0;
            w[j] = (y ^ rotl32(w[j - 13], 7) ^ w[j - 6]) >>> 0;
        }
        const w1 = new Array<number>(64).fill(0);
        for (let j = 0; j < 64; j++) { w1[j] = (w[j] ^ w[j + 4]) >>> 0; }

        let [a, b, c, d, e, f, g, h] = v;
        for (let j = 0; j < 64; j++) {
            const tj = j < 16 ? 0x79cc4519 : 0x7a879d8a;
            const ss1 = rotl32((rotl32(a, 12) + e + rotl32(tj, j & 31)) >>> 0, 7);
            const ss2 = (ss1 ^ rotl32(a, 12)) >>> 0;
            const ff = j < 16 ? (a ^ b ^ c) >>> 0 : ((a & b) | (a & c) | (b & c)) >>> 0;
            const gg = j < 16 ? (e ^ f ^ g) >>> 0 : ((e & f) | (~e & g)) >>> 0;
            const tt1 = (ff + d + ss2 + w1[j]) >>> 0;
            const tt2 = (gg + h + ss1 + w[j]) >>> 0;
            d = c;
            c = rotl32(b, 9);
            b = a;
            a = tt1;
            h = g;
            g = rotl32(f, 19);
            f = e;
            e = (tt2 ^ rotl32(tt2, 9) ^ rotl32(tt2, 17)) >>> 0;
        }
        const deltas = [a, b, c, d, e, f, g, h];
        v = v.map((x, i) => (x ^ deltas[i]) >>> 0);
    }
    const out = Buffer.alloc(32);
    v.forEach((x, i) => out.writeUInt32BE(x >>> 0, i * 4));
    return out;
}

// ---------------------------------------------------------------------------
// Simon（fqapp sign/simon.rs，128 位密钥 / 64 位块 / 72 轮；u64 用 BigInt）
// ---------------------------------------------------------------------------

const SIMON_Z = 0x3dc94c3a046d678bn;
const MASK64 = (1n << 64n) - 1n;

function rotl64(v: bigint, n: number): bigint {
    const b = BigInt(n % 64);
    if (b === 0n) { return v; }
    return ((v << b) | (v >> (64n - b))) & MASK64;
}

function rotr64(v: bigint, n: number): bigint {
    return rotl64(v, 64 - (n % 64));
}

function simonKeyExpansion(key: bigint[]): bigint[] {
    const k = [...key];
    for (let i = 4; i < 72; i++) {
        let tmp = rotr64(k[i - 1], 3);
        tmp ^= k[i - 3];
        tmp ^= rotr64(tmp, 1);
        const notVal = (~k[i - 4]) & MASK64;
        const bitVal = (SIMON_Z >> BigInt((i - 4) % 62)) & 1n;
        k[i] = (notVal ^ tmp ^ bitVal ^ 3n) & MASK64;
    }
    return k;
}

function simonEncBlock(pt: [bigint, bigint], key: bigint[]): [bigint, bigint] {
    let xi = pt[0];
    let xi1 = pt[1];
    for (const rk of key) {
        const tmp = xi1;
        const f = rotl64(xi1, 1) & rotl64(xi1, 8);
        xi1 = (xi ^ f ^ rotl64(xi1, 2) ^ rk) & MASK64;
        xi = tmp;
    }
    return [xi, xi1];
}

// ---------------------------------------------------------------------------
// ProtoBuf 编码器（fqapp sign/protobuf.rs；write_varint 先掩 32 位，保持上游字节布局）
// ---------------------------------------------------------------------------

type PbField =
    | { kind: 'varint'; idx: number; v: bigint }
    | { kind: 'bytes'; idx: number; data: Buffer };

export class ProtoBuf {
    private fields: PbField[] = [];

    putVarint(idx: number, v: bigint | number): this {
        this.fields.push({ kind: 'varint', idx, v: BigInt(v) });
        return this;
    }

    putUtf8(idx: number, s: string): this {
        this.fields.push({ kind: 'bytes', idx, data: Buffer.from(s, 'utf8') });
        return this;
    }

    putBytes(idx: number, data: Buffer): this {
        this.fields.push({ kind: 'bytes', idx, data });
        return this;
    }

    putProtobuf(idx: number, nested: ProtoBuf): this {
        this.fields.push({ kind: 'bytes', idx, data: nested.toBuf() });
        return this;
    }

    toBuf(): Buffer {
        const parts: Buffer[] = [];
        const writeVarint32 = (out: number[], v0: bigint | number) => {
            let v = (BigInt(v0) & 0xffffffffn);
            while (v >= 128n) {
                out.push(Number((v & 127n) | 128n));
                v >>= 7n;
            }
            out.push(Number(v & 127n));
        };
        for (const f of this.fields) {
            const keyBytes: number[] = [];
            writeVarint32(keyBytes, (BigInt(f.idx) << 3n) | BigInt(f.kind === 'varint' ? 0 : 2));
            parts.push(Buffer.from(keyBytes));
            if (f.kind === 'varint') {
                const out: number[] = [];
                writeVarint32(out, f.v);
                parts.push(Buffer.from(out));
            } else {
                const lenBytes: number[] = [];
                writeVarint32(lenBytes, f.data.length);
                parts.push(Buffer.from(lenBytes));
                parts.push(f.data);
            }
        }
        return Buffer.concat(parts);
    }
}

// ---------------------------------------------------------------------------
// x-argus（fqapp sign/argus.rs）
// ---------------------------------------------------------------------------

const ARGUS_SIGN_KEY = Buffer.from('fc78e0a9657a0c748ce51559903ccf03510e51d3cff232d71343e88a321c5304', 'hex');
const ARGUS_AES_KEY = Buffer.from('d31e3718288a1027baab59f146a09a9c', 'hex');
const ARGUS_AES_IV = Buffer.from('ea180a0336ed352fcd24e4d50018ae54', 'hex');
const ARGUS_551_PREFIX = Buffer.from([0xf2, 0x81]);
const ARGUS_551_MAGIC8 = Buffer.from([0xf2, 0xf7, 0xfc, 0xff, 0xf2, 0xf7, 0xfc, 0xff]);
const ARGUS_551_TAIL9 = Buffer.from([0xea, 0xfb, 0x2c, 0xfe, 0x85, 0x68, 0x51, 0x91, 0x54]);

function sm3Prefix6(msg: Buffer): Buffer {
    return sm3(msg).subarray(0, 6);
}

export function argusBodyHash(stubHex: string): Buffer {
    if (stubHex === '') { return sm3Prefix6(Buffer.alloc(16)); }
    return sm3Prefix6(Buffer.from(stubHex, 'hex'));
}

export function argusQueryHash(query: string): Buffer {
    if (query === '') { return sm3Prefix6(Buffer.alloc(16)); }
    return sm3Prefix6(Buffer.from(query, 'utf8'));
}

function pkcs7Align(data: Buffer): Buffer {
    const padLen = 16 - (data.length % 16);
    return Buffer.concat([data, Buffer.alloc(padLen, padLen)]);
}

function aesCbcEncryptNoPad(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    return aesCbcEncrypt(data, key, iv);
}

function simonKeyWords(): bigint[] {
    const out: bigint[] = [];
    for (let i = 0; i < 4; i++) {
        let w = 0n;
        for (let j = 0; j < 8; j++) {
            w |= BigInt(ARGUS_SIGN_KEY[i * 8 + j]) << BigInt(j * 8);
        }
        out.push(w);
    }
    return out;
}

function simonEncryptPadded(protobuf: Buffer): Buffer {
    const key = simonKeyExpansion(simonKeyWords());
    const out = Buffer.alloc(protobuf.length);
    for (let i = 0; i < protobuf.length / 16; i++) {
        const block = protobuf.subarray(i * 16, i * 16 + 16);
        const a = block.subarray(0, 8).readBigUInt64LE(0);
        const b = block.subarray(8, 16).readBigUInt64LE(0);
        const [x, y] = simonEncBlock([a, b], key);
        out.writeBigUInt64LE(x & MASK64, i * 16);
        out.writeBigUInt64LE(y & MASK64, i * 16 + 8);
    }
    return out;
}

export type ArgusStyle = 'bean551' | 'beanSigMgr' | 'beanPhp55';

export interface ArgusParams {
    queryString: string;
    stubHex: string;
    timestamp: number;
    aid: number;
    licenseId?: number;
    deviceId: string;
    installId?: string;
    style?: ArgusStyle;
    randField?: number;
}

export function argusGetSign(p: ArgusParams): string {
    const aid = p.aid === 0 ? 1967 : p.aid;
    const licenseId = p.licenseId === undefined || p.licenseId === 0 ? 1611921764 : p.licenseId;
    const randField = p.randField === undefined || p.randField === 0
        ? randomInt32()
        : p.randField;
    const style = p.style ?? 'bean551';

    const bean = new ProtoBuf();
    bean.putVarint(1, 1077940818);
    bean.putVarint(2, 2);
    bean.putVarint(3, randField);
    bean.putUtf8(4, String(aid));
    bean.putUtf8(5, p.deviceId);
    bean.putUtf8(6, String(licenseId));
    bean.putUtf8(7, queryParam(p.queryString, 'version_name') ?? '');
    if (style === 'bean551' || style === 'beanSigMgr') {
        bean.putUtf8(8, 'v04.04.05-ov-android');
        bean.putVarint(9, 134744640);
        if (style === 'bean551') {
            bean.putBytes(10, Buffer.alloc(8));
        } else {
            bean.putUtf8(10, '');
            bean.putUtf8(11, '0');
        }
        if (style === 'bean551') { bean.putVarint(11, 0); }
    } else {
        bean.putUtf8(8, '');
        bean.putVarint(9, 0);
        bean.putUtf8(10, '');
        bean.putUtf8(11, '');
    }
    bean.putVarint(12, BigInt(p.timestamp) << 1n);
    bean.putBytes(13, argusBodyHash(p.stubHex));
    bean.putBytes(14, argusQueryHash(p.queryString));

    const sub15 = new ProtoBuf();
    sub15.putVarint(1, 1);
    sub15.putVarint(2, 1);
    sub15.putVarint(3, 1);
    sub15.putVarint(7, 0xc792eccc);
    bean.putProtobuf(15, sub15);

    bean.putUtf8(16, p.installId ?? '');
    bean.putUtf8(20, 'none');
    bean.putVarint(21, 738);

    const sub23 = new ProtoBuf();
    sub23.putUtf8(1, 'NX551J');
    sub23.putVarint(2, 8196);
    sub23.putVarint(4, 0x80e0d800);
    bean.putProtobuf(23, sub23);

    bean.putVarint(25, 2);

    if (style === 'bean551') {
        return argusEncrypt551(bean.toBuf());
    }
    return argusEncryptLegacy(bean.toBuf());
}

/** 551 加密封装（当前上游接受的形式） */
export function argusEncrypt551(protobuf: Buffer): string {
    const padded = pkcs7Align(protobuf);
    const encPb = simonEncryptPadded(padded);

    const un = Buffer.concat([ARGUS_551_MAGIC8, encPb, ARGUS_551_TAIL9]);
    const buf = Buffer.alloc(un.length);
    ARGUS_551_MAGIC8.copy(buf, 0);
    for (let i = 8; i < un.length; i++) {
        buf[i] = un[i] ^ ARGUS_551_MAGIC8[i % 8];
    }
    buf.reverse();
    const fin = pkcs7Align(Buffer.concat([buf, Buffer.from('ao', 'utf8')]));
    const out = aesCbcEncryptNoPad(fin, ARGUS_AES_KEY, ARGUS_AES_IV);
    return Buffer.concat([ARGUS_551_PREFIX, out]).toString('base64');
}

/** 旧版（PHP 55 / SignatureManager）加密路径，向量验证用 */
export function argusEncryptLegacy(protobuf: Buffer): string {
    const padded = pkcs7Align(protobuf);
    const encPb = simonEncryptPadded(padded);

    // argus_encrypt_enc_pb：以 encPb 前 8 字节为异或键
    const length = padded.length + 8;
    const buf = Buffer.alloc(length);
    const n = Math.min(encPb.length, length);
    encPb.copy(buf, 0, 0, n);
    const xorKey = encPb.subarray(0, 8);
    for (let i = 8; i < length; i++) {
        const src = i < encPb.length ? encPb[i] : 0;
        buf[i] = src ^ xorKey[i % 8];
    }
    buf.reverse();
    const fin = pkcs7Align(Buffer.concat([buf, Buffer.from('ao', 'utf8')]));
    const out = aesCbcEncryptNoPad(fin, ARGUS_AES_KEY, ARGUS_AES_IV);
    return out.toString('base64');
}

function randomInt32(): number {
    return randomBytes(4).readInt32LE(0);
}

// ---------------------------------------------------------------------------
// x-ladon（fqapp sign/ladon.rs）
// ---------------------------------------------------------------------------

function u64FromLe(buf: Buffer, off: number): bigint {
    return buf.readBigUInt64LE(off) & MASK64;
}

function ladonExpandHashTable(md5HexStr: string): Buffer {
    const ht = Buffer.alloc(288);
    const md5Bytes = Buffer.from(md5HexStr, 'utf8');
    const prefixLen = Math.min(32, md5Bytes.length);
    md5Bytes.copy(ht, 0, 0, prefixLen);

    const temp: bigint[] = [];
    for (let i = 0; i < 4; i++) { temp.push(u64FromLe(ht, i * 8)); }
    let bufB0 = temp[0];
    let bufB8 = temp[1];
    temp.splice(0, 2);

    for (let i = 0; i < 34; i++) {
        const x9 = bufB0;
        let x8 = bufB8;
        x8 = rotr64(x8, 8);
        x8 = (x8 + x9) & MASK64;
        x8 ^= BigInt(i);
        temp.push(x8);
        x8 ^= rotl64(x9, 3);
        for (let j = 0; j < 8; j++) {
            ht[(i + 1) * 8 + j] = Number((x8 >> BigInt(j * 8)) & 255n);
        }
        bufB0 = x8;
        bufB8 = temp[0];
        temp.shift();
    }
    return ht;
}

function ladonEncryptBlock(ht: Buffer, block: Buffer): Buffer {
    let data0 = u64FromLe(block, 0);
    let data1 = u64FromLe(block, 8);
    for (let i = 0; i < 34; i++) {
        const hash = u64FromLe(ht, i * 8);
        const rotated = rotr64(data1, 8);
        const sum = (data0 + rotated) & MASK64;
        data1 = hash ^ sum;
        data0 = data1 ^ rotl64(data0, 3);
    }
    const out = Buffer.alloc(16);
    out.writeBigUInt64LE(data0 & MASK64, 0);
    out.writeBigUInt64LE(data1 & MASK64, 8);
    return out;
}

function ladonEncryptRaw(md5HexStr: string, data: Buffer): Buffer {
    const ht = ladonExpandHashTable(md5HexStr);
    const size = data.length;
    const newSize = size + (16 - (size % 16));
    const padVal = newSize - size;
    const input = Buffer.alloc(newSize, padVal);
    data.copy(input, 0);
    const parts: Buffer[] = [];
    for (let i = 0; i < newSize / 16; i++) {
        parts.push(ladonEncryptBlock(ht, input.subarray(i * 16, i * 16 + 16)));
    }
    return Buffer.concat(parts);
}

export function ladonEncrypt(khronos: number, lcId: number, aid: number, randomBytes: Buffer): string {
    const data = Buffer.from(`${khronos}-${lcId}-${aid}`, 'utf8');
    const keygen = Buffer.concat([randomBytes, Buffer.from(String(aid), 'utf8')]);
    const md5HexStr = md5Hex(keygen);
    const encrypted = ladonEncryptRaw(md5HexStr, data);
    return Buffer.concat([randomBytes, encrypted]).toString('base64');
}

// ---------------------------------------------------------------------------
// x-gorgon（fqapp sign/gorgon.rs，8404 方案；注册链路使用）
// ---------------------------------------------------------------------------

export function generateXGorgon(param: string): string {
    const ts = Math.floor(Date.now() / 1000);
    const timeBytes = Buffer.alloc(4);
    timeBytes.writeUInt32BE(ts >>> 0, 0);
    const sum = md5(param);
    const data = Buffer.concat([sum.subarray(0, 4), Buffer.from([0, 0, 0, 0, 0, 1, 7, 4]), timeBytes]);

    const table: number[] = [];
    for (let i = 0; i < 256; i++) { table.push(i); }
    const rnd = randomBytes(2);
    const key = [74, 0, 22, rnd[1], 71, 108, 0, rnd[0]];

    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + table[i] + key[i & 7]) >>> 0;
        j &= 255;
        table[i] = table[j];
    }

    const dlen = data.length;
    let k = 0;
    for (let i = 1; i <= dlen; i++) {
        const idx = ((((i - 1) ^ 1) + ((i - 1) & 1)) << 1) & 255;
        const tableVal = table[idx];
        const xorVal = k ^ tableVal;
        k = (((k | tableVal) << 1) - xorVal) >>> 0;

        const idx2 = k & 255;
        const tableVal2 = table[idx2];
        table[idx] = tableVal2;
        table[idx2] = tableVal2;

        const encIdx = ((tableVal2 | tableVal2) + (tableVal2 & tableVal2)) & 255;
        data[i - 1] = (data[i - 1] ^ table[encIdx]) & 255;
    }

    const W2 = 0xffffffaa;
    const W3 = 85;
    const W4 = 51;
    const lenInv = ~dlen >>> 0;

    for (let i = 1; i <= dlen; i++) {
        let val = data[i - 1];
        val = ((val >> 4) & 15) | ((val & 15) << 4);
        data[i - 1] = val & 255;

        if (i === dlen) {
            data[i - 1] = (val ^ data[0]) & 255;
        } else {
            const next = data[i];
            data[i - 1] = ((val | next) - (val & next)) & 255;
        }

        const v = data[i - 1];
        const t1 = W2 & ((v << 1) >>> 0);
        const t2 = W3 & (v >>> 1);
        const v2 = (t1 | t2) >>> 0;

        const t3 = (v2 << 2) >>> 0;
        const t4 = W4 & (v2 >>> 2);
        let mix = (t3 & 0xffffffcf) | t4;

        const high = (mix >> 4) & 15;
        const low = mix & 268435455;
        mix = ((low << 4) | high) >>> 0;

        data[i - 1] = (mix ^ lenInv) & 255;
    }

    return Buffer.concat([Buffer.from([132, 4, rnd[0], rnd[1], 0, 0]), data]).toString('hex');
}

// ---------------------------------------------------------------------------
// 签名管理器（fqapp sign/mod.rs）
// ---------------------------------------------------------------------------

export function queryParam(queryString: string, name: string): string | undefined {
    for (const pair of queryString.split('&')) {
        const eq = pair.indexOf('=');
        if (eq > 0 && pair.slice(0, eq) === name) {
            return pair.slice(eq + 1);
        }
    }
    return undefined;
}

export interface HeaderOpts {
    /** 覆盖参与 x-ss-stub 的内容（null = 用请求体） */
    stubBody?: Buffer | null;
    installIdField16?: string;
    enableGorgon?: boolean;
}

/** 生成签名请求头（x-ss-req-ticket / x-khronos / x-ladon / x-argus [/ x-ss-stub] [/ x-gorgon]） */
export function generateSignHeaders(
    queryString: string,
    postData: Buffer | null,
    opts: HeaderOpts = {}
): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000);
    const aid = (() => {
        const v = queryString ? queryParam(queryString, 'aid') : undefined;
        const n = v ? Number(v) : NaN;
        return Number.isFinite(n) && n !== 0 ? n : 1967;
    })();

    let stubHex = '';
    const src = opts.stubBody !== undefined && opts.stubBody !== null ? opts.stubBody : postData;
    if (src && src.length > 0) {
        stubHex = md5Hex(src);
    }

    const headers: Record<string, string> = {
        'x-ss-req-ticket': String(ts * 1000),
        'x-khronos': String(ts),
    };
    headers['x-ladon'] = ladonEncrypt(ts, 1611921764, aid, randomBytes(4));
    headers['x-argus'] = argusGetSign({
        queryString,
        stubHex,
        timestamp: ts,
        aid,
        deviceId: queryParam(queryString, 'device_id') ?? '',
        installId: opts.installIdField16 ?? '',
        style: 'bean551',
    });
    if (stubHex !== '') {
        headers['x-ss-stub'] = stubHex;
    }
    if (opts.enableGorgon) {
        headers['x-gorgon'] = generateXGorgon(queryString);
    }
    return headers;
}

// 导出供 ttEncrypt / spade 使用（避免循环依赖集中在此再导出）
export { sha512Buf };

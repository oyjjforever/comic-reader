import { Buffer } from 'buffer';
import { aesEcbEncryptBlock } from './crypto';

/**
 * MP4 CENC 解密（自 fq-reader-chrome src/shared/api/cenc.ts 原样移植，
 * 源自 fqapp rust/src/endpoints/video.rs）。
 * 处理 encv/enca 加密轨道：改写 sample entry、按 senc 表用内容密钥做 AES-CTR 解密。
 */

interface Mp4Box {
    off: number;
    size: number;
    header: number;
    typ: string;
}

function u16be(d: Buffer, o: number): number {
    return o + 2 > d.length ? 0 : d.readUInt16BE(o);
}
function u32be(d: Buffer, o: number): number {
    return o + 4 > d.length ? 0 : d.readUInt32BE(o);
}
function u64be(d: Buffer, o: number): number {
    return o + 8 > d.length ? 0 : Number(d.readBigUInt64BE(o));
}

function typeOf(d: Buffer, off: number): string {
    return d.toString('latin1', off + 4, off + 8);
}

function iterBoxes(d: Buffer, start: number, end: number): Mp4Box[] {
    const e = Math.min(end, d.length);
    const boxes: Mp4Box[] = [];
    let off = start;
    while (off + 8 <= e) {
        let size = u32be(d, off);
        const typ = typeOf(d, off);
        let header = 8;
        if (size === 1) {
            if (off + 16 > e) { break; }
            const s64 = u64be(d, off + 8);
            if (s64 > Number.MAX_SAFE_INTEGER) { break; }
            size = s64;
            header = 16;
        } else if (size === 0) {
            size = e - off;
        }
        if (size < header || off + size > e) { break; }
        boxes.push({ off, size, header, typ });
        off += size;
    }
    return boxes;
}

function boxChildrenStart(typ: string, off: number, header: number): number | undefined {
    switch (typ) {
        case 'moov': case 'trak': case 'mdia': case 'minf': case 'stbl': case 'dinf': case 'edts': case 'udta':
            return off + header;
        case 'stsd':
            return off + header + 8;
        case 'encv': case 'avc1': case 'hvc1': case 'hev1':
            return off + header + 78;
        case 'enca': case 'mp4a':
            return off + header + 28;
        default:
            return undefined;
    }
}

type BoxMap = Map<string, Mp4Box[]>;

function walkBoxes(d: Buffer, childStart: number, childEnd: number, found: BoxMap): void {
    for (const b of iterBoxes(d, childStart, childEnd)) {
        let list = found.get(b.typ);
        if (!list) { list = []; found.set(b.typ, list); }
        list.push(b);
        const nested = boxChildrenStart(b.typ, b.off, b.header);
        if (nested !== undefined && nested < b.off + b.size) {
            walkBoxes(d, nested, b.off + b.size, found);
        }
    }
}

function mp4TrackBoxes(d: Buffer): BoxMap[] {
    const tracks: BoxMap[] = [];
    for (const b of iterBoxes(d, 0, d.length)) {
        if (b.typ !== 'moov') { continue; }
        for (const child of iterBoxes(d, b.off + b.header, b.off + b.size)) {
            if (child.typ === 'trak') {
                const map: BoxMap = new Map();
                walkBoxes(d, child.off + child.header, child.off + child.size, map);
                tracks.push(map);
            }
        }
    }
    return tracks;
}

/** 是否含 CENC 加密轨道（encv/enca） */
export function mp4NeedsCencDecrypt(data: Buffer): boolean {
    for (const boxes of mp4TrackBoxes(data)) {
        const encv = boxes.get('encv');
        const enca = boxes.get('enca');
        if ((encv && encv.length > 0) || (enca && enca.length > 0)) { return true; }
    }
    return false;
}

interface StscEntry { firstChunk: number; samplesPerChunk: number }
interface SampleRange { off: number; size: number }
interface SubsampleRange { clear: number; encrypted: number }
interface SencEntry { iv: Buffer; subsamples: SubsampleRange[] }

function parseStsz(d: Buffer, b: Mp4Box): number[] {
    let p = b.off + 12;
    if (p + 8 > d.length) { return []; }
    const sampleSize = u32be(d, p);
    const sampleCount = u32be(d, p + 4);
    p += 8;
    const out: number[] = [];
    if (sampleSize !== 0) {
        if (sampleCount > 1_000_000) { return []; }
        if (sampleCount * sampleSize > d.length) { return []; }
        for (let i = 0; i < sampleCount; i++) { out.push(sampleSize); }
        return out;
    }
    let i = 0;
    while (i < sampleCount && p + i * 4 + 4 <= d.length) {
        out.push(u32be(d, p + i * 4));
        i++;
    }
    return out;
}

function parseChunkOffsets(d: Buffer, b: Mp4Box): number[] {
    let p = b.off + 12;
    if (p + 4 > d.length) { return []; }
    const entryCount = u32be(d, p);
    p += 4;
    const out: number[] = [];
    if (b.typ === 'co64') {
        let i = 0;
        while (i < entryCount && p + i * 8 + 8 <= d.length) {
            out.push(u64be(d, p + i * 8));
            i++;
        }
        return out;
    }
    let i = 0;
    while (i < entryCount && p + i * 4 + 4 <= d.length) {
        out.push(u32be(d, p + i * 4));
        i++;
    }
    return out;
}

function parseStsc(d: Buffer, b: Mp4Box): StscEntry[] {
    let p = b.off + 12;
    if (p + 4 > d.length) { return []; }
    const entryCount = u32be(d, p);
    p += 4;
    const out: StscEntry[] = [];
    let i = 0;
    while (i < entryCount && p + i * 12 + 12 <= d.length) {
        out.push({ firstChunk: u32be(d, p + i * 12), samplesPerChunk: u32be(d, p + i * 12 + 4) });
        i++;
    }
    return out;
}

function sampleOffsets(stsc: StscEntry[], chunkOffsets: number[], sampleSizes: number[]): SampleRange[] {
    const offsets: SampleRange[] = [];
    let sampleIndex = 0;
    let stscIndex = 0;
    for (let chunkIndex = 0; chunkIndex < chunkOffsets.length; chunkIndex++) {
        const oneBased = chunkIndex + 1;
        while (stscIndex + 1 < stsc.length && stsc[stscIndex + 1].firstChunk <= oneBased) {
            stscIndex++;
        }
        if (stscIndex >= stsc.length) { break; }
        let off = chunkOffsets[chunkIndex];
        for (let s = 0; s < stsc[stscIndex].samplesPerChunk; s++) {
            if (sampleIndex >= sampleSizes.length) { return offsets; }
            const size = sampleSizes[sampleIndex];
            offsets.push({ off, size });
            off += size;
            sampleIndex++;
        }
    }
    return offsets;
}

function trackIvSize(d: Buffer, boxes: BoxMap): number {
    const list = boxes.get('tenc');
    if (list) {
        for (const b of list) {
            if (b.size >= 32 && b.off + 16 <= d.length) {
                return d[b.off + 15];
            }
        }
    }
    return 0;
}

function parseSenc(d: Buffer, b: Mp4Box, ivSize: number): SencEntry[] {
    if (b.off + 16 > d.length) { return []; }
    const flags = (d[b.off + 9] << 16) | (d[b.off + 10] << 8) | d[b.off + 11];
    const sampleCount = u32be(d, b.off + 12);
    let p = b.off + 16;
    let end = Math.min(b.off + b.size, d.length);
    const entries: SencEntry[] = [];
    for (let n = 0; n < sampleCount; n++) {
        if (p + ivSize > end) { break; }
        const iv = Buffer.from(d.subarray(p, p + ivSize));
        p += ivSize;
        const subsamples: SubsampleRange[] = [];
        if (flags & 0x02) {
            if (p + 2 > end) { break; }
            const subsampleCount = u16be(d, p);
            p += 2;
            for (let i = 0; i < subsampleCount; i++) {
                if (p + 6 > end) { break; }
                subsamples.push({ clear: u16be(d, p), encrypted: u32be(d, p + 2) });
                p += 6;
            }
        }
        entries.push({ iv, subsamples });
    }
    return entries;
}

interface ByteRange { off: number; size: number }

function ctrCryptRanges(d: Buffer, key: Buffer, iv: Buffer, ranges: ByteRange[]): void {
    if (ranges.length === 0) { return; }
    const counter = Buffer.alloc(16);
    if (iv.length === 8) { iv.copy(counter, 0); }
    else if (iv.length === 16) { iv.copy(counter); }
    else { throw new Error(`不支持的 CENC IV 长度: ${iv.length}`); }

    let keystream: Buffer = Buffer.alloc(16);
    let keystreamPos = 16;
    for (const r of ranges) {
        if (r.size === 0 || r.off + r.size > d.length) { continue; }
        for (let i = 0; i < r.size; i++) {
            if (keystreamPos === 16) {
                keystream = aesEcbEncryptBlock(key, counter);
                // 大端进位
                for (let j = 15; j >= 0; j--) {
                    counter[j] = (counter[j] + 1) & 0xff;
                    if (counter[j] !== 0) { break; }
                }
                keystreamPos = 0;
            }
            d[r.off + i] ^= keystream[keystreamPos];
            keystreamPos++;
        }
    }
}

function rewriteEncryptedSampleEntries(d: Buffer, boxes: BoxMap): void {
    const replacements: Array<[string, string]> = [['encv', 'hvc1'], ['enca', 'mp4a']];
    for (const [typ, replacement] of replacements) {
        const list = boxes.get(typ);
        if (!list) { continue; }
        for (const b of list) {
            if (b.off + 8 <= d.length) {
                d.write(replacement, b.off + 4, 'latin1');
            }
            const childStart = boxChildrenStart(typ, b.off, b.header);
            if (childStart === undefined) { continue; }
            for (const child of iterBoxes(d, childStart, b.off + b.size)) {
                if (child.typ === 'sinf') {
                    d.writeUInt32BE(8, child.off);
                    d.write('free', child.off + 4, 'latin1');
                    const start = child.off + 8;
                    const end = Math.min(child.off + child.size, d.length);
                    if (start < end) { d.fill(0, start, end); }
                    break;
                }
            }
        }
    }
}

/** 就地解密 CENC MP4 */
export function decryptCencMp4(data: Buffer, contentKey: Buffer): Buffer {
    if (contentKey.length !== 16 && contentKey.length !== 24 && contentKey.length !== 32) {
        throw new Error('内容密钥长度非法');
    }
    const d = Buffer.from(data);
    for (const boxes of mp4TrackBoxes(d)) {
        rewriteEncryptedSampleEntries(d, boxes);
        const sencBoxes = boxes.get('senc') ?? [];
        const stszBoxes = boxes.get('stsz') ?? [];
        const stscBoxes = boxes.get('stsc') ?? [];
        if (sencBoxes.length === 0 || stszBoxes.length === 0 || stscBoxes.length === 0) { continue; }
        const stco = boxes.get('stco');
        const co64 = boxes.get('co64');
        const chunkBox = stco && stco[0] ? stco[0] : co64 && co64[0] ? co64[0] : undefined;
        if (!chunkBox) { continue; }

        const sampleSizes = parseStsz(d, stszBoxes[0]);
        const chunkOffsets = parseChunkOffsets(d, chunkBox);
        const stscEntries = parseStsc(d, stscBoxes[0]);
        const samples = sampleOffsets(stscEntries, chunkOffsets, sampleSizes);
        let ivSize = trackIvSize(d, boxes);
        if (ivSize === 0) { ivSize = 8; }
        const sencEntries = parseSenc(d, sencBoxes[0], ivSize);
        const n = Math.min(samples.length, sencEntries.length);
        for (let i = 0; i < n; i++) {
            const sample = samples[i];
            const entry = sencEntries[i];
            if (sample.size === 0) { continue; }
            const ranges: ByteRange[] = [];
            if (entry.subsamples.length > 0) {
                let pos = sample.off;
                for (const sub of entry.subsamples) {
                    pos += sub.clear;
                    if (sub.encrypted > 0) {
                        ranges.push({ off: pos, size: sub.encrypted });
                    }
                    pos += sub.encrypted;
                }
            } else {
                ranges.push({ off: sample.off, size: sample.size });
            }
            ctrCryptRanges(d, contentKey, entry.iv, ranges);
        }
    }
    return d;
}

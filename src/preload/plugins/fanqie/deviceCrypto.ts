import { Buffer } from 'buffer';
import { randomBytes, sha512Buf, aesCbcEncrypt, aesCbcDecrypt, pkcs7Pad, pkcs7Unpad } from './crypto';

/**
 * 设备注册链路加密原语（自 fq-reader-chrome src/shared/api/deviceCrypto.ts 原样移植，
 * 对齐 fqapp crypto.rs；向量见 fq-reader-chrome test/device_vectors.json）。
 */

const TT_FIXED_STRING_B64 = 'TdTC5rgxYgkOUrPHpnM7pByyRiuCmrWKGWs521cXdST0m69/COjWjSanLjfBqVovHwWlGJKu8pSXMrYqOKrdWA==';
export const REGISTER_KEY_MASTER = Buffer.from('ac25c67ddd8f38c1b37a2348828e222e', 'hex');
export const REGISTER_KEY_REQ_KEY = Buffer.from('rCXGfd2POMGzeiNIgo4iLg==', 'base64');

/** fqapp tt_encrypt：magic + random32 + AES(SHA512(SHA512(r32)+fixed) 前32字节作 key/iv, SHA512(data)+data) */
export function ttEncrypt(data: Buffer, rndOverride?: Buffer): Buffer {
    const rnd = rndOverride ?? randomBytes(32);
    const fixed = Buffer.from(TT_FIXED_STRING_B64, 'base64');
    const inner = sha512Buf(rnd);
    const hv = sha512Buf(Buffer.concat([inner, fixed]));
    const key = hv.subarray(0, 16);
    const iv = hv.subarray(16, 32);
    const dataHash = sha512Buf(data);
    const padded = pkcs7Pad(Buffer.concat([dataHash, data]));
    const enc = aesCbcEncrypt(padded, key, iv);
    return Buffer.concat([Buffer.from([0x74, 0x63, 0x05, 0x10, 0x00, 0x00]), rnd, enc]);
}

/** fqapp reverse_hex：device_id 十进制 → 32 位十六进制零填充 → 按字节对反转 */
export function reverseHex(deviceId: string): string {
    if (!/^\d+$/.test(deviceId)) { throw new Error(`device_id 非数字: ${deviceId}`); }
    const h = BigInt(deviceId).toString(16).padStart(32, '0');
    const bytes = Buffer.from(h, 'utf8');
    const out: number[] = [];
    for (let i = bytes.length; i >= 2; i -= 2) {
        out.push(bytes[i - 2], bytes[i - 1]);
    }
    return Buffer.from(out).toString('utf8');
}

/** fqapp encrypt_register_key_request：base64(iv + AES(pkcs7(hex2bin(reverseHex(id))))) */
export function encryptRegisterKeyRequest(deviceId: string, ivOverride?: Buffer): string {
    const iv = ivOverride ?? randomBytes(16);
    const raw = Buffer.from(reverseHex(deviceId), 'hex');
    const enc = aesCbcEncrypt(pkcs7Pad(raw), REGISTER_KEY_REQ_KEY, iv);
    return Buffer.concat([iv, enc]).toString('base64');
}

/** fqapp decrypt_register_key */
export function decryptRegisterKey(keyB64: string): string {
    const data = Buffer.from(keyB64, 'base64');
    if (data.length < 16 || (data.length - 16) % 16 !== 0 || data.length === 16) {
        throw new Error('registerkey 密文长度非法');
    }
    const pt = aesCbcDecrypt(data.subarray(16), REGISTER_KEY_MASTER, data.subarray(0, 16));
    return pkcs7Unpad(pt).toString('hex').toUpperCase();
}

import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'buffer';

/**
 * 短剧视频文件缓存（替代 fq-reader-chrome 的 IndexedDB storage.ts）：
 * 目录 <userData>/fanqie-cache/<seriesId>/<序号>_<videoId>.mp4，
 * codec 元数据写在同名 .meta 文件中。缓存目录路径由主进程 IPC 提供
 * （preload 无 app 对象，通过 index.ts 的 getCacheDir 注入，见 fanqie/index.ts）。
 */

let cacheRoot: string | null = null;

/** 注入缓存根目录（主进程 IPC 返回后调用）；未注入时惰性等待 */
export function setCacheRoot(root: string): void {
    cacheRoot = root;
}

export function getCacheRoot(): string {
    if (!cacheRoot) { throw new Error('fanqie 缓存目录未初始化'); }
    return cacheRoot;
}

function seriesDir(seriesId: string): string {
    return path.join(getCacheRoot(), seriesId);
}

/** 某集在目录列表中的序号（文件名前缀），未知返回 0 */
function fileIndex(fileName: string): number {
    const m = fileName.match(/^(\d+)_/);
    return m ? Number(m[1]) : 0;
}

function episodePath(seriesId: string, videoId: string, index: number): string {
    return path.join(seriesDir(seriesId), `${String(index).padStart(4, '0')}_${videoId}.mp4`);
}

export function hasDramaEpisode(seriesId: string, videoId: string): boolean {
    try {
        return fs.existsSync(episodePath(seriesId, videoId, 0)) ||
            fs.readdirSync(seriesDir(seriesId)).some((f) => f.endsWith(`_${videoId}.mp4`));
    } catch {
        return false;
    }
}

function findEpisodeFile(seriesId: string, videoId: string): string | null {
    try {
        const dir = seriesDir(seriesId);
        const hit = fs.readdirSync(dir).find((f) => f.endsWith(`_${videoId}.mp4`));
        return hit ? path.join(dir, hit) : null;
    } catch {
        return null;
    }
}

/** 已缓存集的 videoId 列表（按文件名序号升序），用于播放器跳转 */
export function listCachedEpisodes(seriesId: string): string[] {
    try {
        return fs.readdirSync(seriesDir(seriesId))
            .filter((f) => f.endsWith('.mp4'))
            .sort((a, b) => fileIndex(a) - fileIndex(b))
            .map((f) => f.slice(f.indexOf('_') + 1, -4));
    } catch {
        return [];
    }
}

export function putDramaEpisode(seriesId: string, videoId: string, data: Buffer, codec: string, index = 0): string {
    fs.mkdirSync(seriesDir(seriesId), { recursive: true });
    // 若已存在（含不同序号），先移除避免重复
    const existing = findEpisodeFile(seriesId, videoId);
    if (existing && existing !== episodePath(seriesId, videoId, index)) {
        fs.rmSync(existing);
        const meta = existing + '.meta';
        if (fs.existsSync(meta)) { fs.rmSync(meta); }
    }
    const file = episodePath(seriesId, videoId, index);
    fs.writeFileSync(file, data);
    fs.writeFileSync(file + '.meta', codec, 'utf8');
    return file;
}

export function getDramaPath(seriesId: string, videoId: string): string | null {
    return findEpisodeFile(seriesId, videoId);
}

export function getDramaCodec(seriesId: string, videoId: string): string {
    const file = findEpisodeFile(seriesId, videoId);
    if (!file) { return ''; }
    try {
        return fs.readFileSync(file + '.meta', 'utf8');
    } catch {
        return '';
    }
}

/** 系列缓存总大小（字节），用于设置页/清理展示 */
export function cacheSize(): number {
    let total = 0;
    const walk = (dir: string): void => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch { return; }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); }
            else {
                try { total += fs.statSync(p).size; } catch { /* 忽略 */ }
            }
        }
    };
    try {
        walk(getCacheRoot());
    } catch { /* 根目录不存在 */ }
    return total;
}

/** 清空全部短剧缓存 */
export function clearCache(): void {
    fs.rmSync(getCacheRoot(), { recursive: true, force: true });
}

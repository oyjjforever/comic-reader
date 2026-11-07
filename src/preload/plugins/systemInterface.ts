import { exec } from 'child_process'
import fs from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import path from 'path'
import FileUtils from './file'

function openExplorer(path: string) {
    path = path.replaceAll('/', '\\')
    exec(`explorer /select,"${path}"`);
}
function unzip(path: string) {
    // const fileName = FileUtils.getFileNameWithoutExtension(path)
    exec(`7z x ${path} -o${FileUtils}`);
}

async function deleteFolder(folderPath: string): Promise<boolean> {
    try {
        const stats = await fs.stat(folderPath);
        if (!stats.isDirectory()) {
            throw new Error('Path is not a directory');
        }
        await fs.rm(folderPath, { recursive: true, force: true });
        return true;
    } catch (error) {
        console.error('Failed to delete folder:', error);
        return false;
    }
}

/** 仅删除空文件夹：先 readdir 校验，rmdir 本身也只允许空目录（双保险） */
async function deleteFolderIfEmpty(folderPath: string): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(folderPath);
        if (!stats.isDirectory()) {
            throw new Error('路径不是文件夹');
        }
        const entries = await fs.readdir(folderPath);
        if (entries.length > 0) {
            throw new Error('文件夹不为空，只能删除空文件夹');
        }
        await fs.rmdir(folderPath);
        return { success: true };
    } catch (error) {
        console.error('Failed to delete empty folder:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

async function createFolder(parentPath: string, folderName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(parentPath);
        if (!stats.isDirectory()) {
            throw new Error('父路径不是文件夹');
        }
        // Windows 文件名非法字符
        if (/[\\/:*?"<>|]/.test(folderName)) {
            throw new Error('文件夹名称包含非法字符 \\ / : * ? " < > |');
        }
        const newPath = path.join(parentPath, folderName);
        const exists = await fs.stat(newPath).then(() => true, () => false);
        if (exists) {
            throw new Error('同名文件夹已存在');
        }
        await fs.mkdir(newPath);
        return { success: true };
    } catch (error) {
        console.error('Failed to create folder:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

interface CopyProgress {
    bytes: number
    totalBytes: number
}

/**
 * 流式复制（兼容单文件/目录），跨盘移动时用于上报字节级进度
 * 进度回调按 ~100ms 节流
 */
async function copyWithProgress(
    srcPath: string,
    destPath: string,
    onProgress?: (p: CopyProgress) => void
): Promise<void> {
    const stat = await fs.stat(srcPath);
    const files: Array<{ src: string; dest: string; size: number }> = [];
    if (stat.isFile()) {
        files.push({ src: srcPath, dest: destPath, size: stat.size });
    } else {
        const walk = async (dir: string, rel: string): Promise<void> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const src = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(src, rel ? path.join(rel, entry.name) : entry.name);
                } else if (entry.isFile()) {
                    const fileStat = await fs.stat(src);
                    files.push({ src, dest: path.join(destPath, rel, entry.name), size: fileStat.size });
                }
            }
        };
        await walk(srcPath, '');
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let copiedBytes = 0;
    let lastReport = 0;
    const report = (force = false) => {
        if (!onProgress) return;
        const now = Date.now();
        if (force || now - lastReport >= 100) {
            lastReport = now;
            onProgress({ bytes: copiedBytes, totalBytes });
        }
    };

    for (const file of files) {
        await fs.mkdir(path.dirname(file.dest), { recursive: true });
        await new Promise<void>((resolve, reject) => {
            const rs = createReadStream(file.src);
            const ws = createWriteStream(file.dest);
            let settled = false;
            const fail = (err: Error) => {
                if (!settled) {
                    settled = true;
                    rs.destroy();
                    ws.destroy();
                    reject(err);
                }
            };
            rs.on('data', (chunk: string | Buffer) => {
                copiedBytes += chunk.length;
                report();
            });
            rs.on('error', fail);
            ws.on('error', fail);
            ws.on('close', () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            });
            rs.pipe(ws);
        });
        report(true);
    }
    report(true);
}

async function movePath(
    srcPath: string,
    destFolderPath: string,
    onProgress?: (p: CopyProgress) => void
): Promise<{ success: boolean; error?: string }> {
    try {
        const destStats = await fs.stat(destFolderPath);
        if (!destStats.isDirectory()) {
            throw new Error('目标路径不是文件夹');
        }
        // 不允许移动到自身或自身的子目录下
        const normalizedSrc = path.resolve(srcPath) + path.sep;
        if (path.resolve(destFolderPath).startsWith(normalizedSrc)) {
            throw new Error('不能移动到自身或其子目录下');
        }
        // 源与目标在同一目录时无需移动
        if (path.dirname(path.resolve(srcPath)) === path.resolve(destFolderPath)) {
            throw new Error('作品已在目标文件夹中');
        }
        const baseName = path.basename(srcPath);
        const destPath = path.join(destFolderPath, baseName);
        const exists = await fs.stat(destPath).then(() => true, () => false);
        if (exists) {
            throw new Error(`目标位置已存在同名项: ${baseName}`);
        }
        try {
            // 同盘 rename 瞬时完成，无进度可报
            await fs.rename(srcPath, destPath);
            onProgress?.({ bytes: 1, totalBytes: 1 });
        } catch (err: any) {
            if (err.code === 'EXDEV') {
                // 跨盘移动：流式复制（带字节级进度）后删除源
                await copyWithProgress(srcPath, destPath, onProgress);
                await fs.rm(srcPath, { recursive: true, force: true });
            } else {
                throw err;
            }
        }
        return { success: true };
    } catch (error) {
        console.error('Failed to move:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/** 递归统计路径列表的文件数与总大小（文件本身计 1，目录计其下所有文件；不统计空目录本身） */
async function countFiles(paths: string[]): Promise<{ count: number; size: number }> {
    let count = 0;
    let size = 0;
    const walk = async (p: string): Promise<void> => {
        let stat;
        try {
            stat = await fs.stat(p);
        } catch {
            return; // 路径不可访问时跳过
        }
        if (!stat.isDirectory()) {
            count++;
            size += stat.size;
            return;
        }
        const entries = await fs.readdir(p, { withFileTypes: true });
        await Promise.all(
            entries.map(async (entry) => {
                const child = path.join(p, entry.name);
                if (entry.isDirectory()) {
                    await walk(child);
                } else {
                    count++;
                    try {
                        const childStat = await fs.stat(child);
                        size += childStat.size;
                    } catch {
                        // 无法 stat 的文件只计数不计大小
                    }
                }
            })
        );
    };
    await Promise.all(paths.map((p) => walk(p)));
    return { count, size };
}

/** 重命名（同目录改名，文件与目录通用），返回新路径 */
async function renamePath(
    srcPath: string,
    newName: string
): Promise<{ success: boolean; newPath?: string; error?: string }> {
    try {
        const trimmed = newName.trim();
        if (!trimmed) {
            throw new Error('名称不能为空');
        }
        // 与 createFolder 相同的 Windows 非法字符校验
        if (/[\\/:*?"<>|]/.test(trimmed)) {
            throw new Error('名称包含非法字符 \\ / : * ? " < > |');
        }
        const old = srcPath.replace(/[\\/]+$/, '');
        const destPath = path.join(path.dirname(old), trimmed);
        if (destPath === old) {
            throw new Error('名称未变化');
        }
        const exists = await fs.stat(destPath).then(() => true, () => false);
        if (exists) {
            throw new Error(`目标位置已存在同名项: ${trimmed}`);
        }
        // 同目录改名不会跨盘，rename 原子完成
        await fs.rename(old, destPath);
        return { success: true, newPath: destPath };
    } catch (error) {
        console.error('Failed to rename:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export default {
    openExplorer,
    unzip,
    deleteFolder,
    deleteFolderIfEmpty,
    createFolder,
    movePath,
    renamePath,
    countFiles
}
import { exec } from 'child_process'
import fs from 'fs/promises'
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

async function movePath(srcPath: string, destFolderPath: string): Promise<{ success: boolean; error?: string }> {
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
            await fs.rename(srcPath, destPath);
        } catch (err: any) {
            if (err.code === 'EXDEV') {
                // 跨盘移动：先复制再删除源
                await fs.cp(srcPath, destPath, { recursive: true });
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

export default {
    openExplorer,
    unzip,
    deleteFolder,
    deleteFolderIfEmpty,
    createFolder,
    movePath
}
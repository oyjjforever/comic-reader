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

export default {
    openExplorer,
    unzip,
    deleteFolder
}
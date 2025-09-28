import { exec } from 'child_process'
import FileUtils from '../../utils/file'

function openExplorer(path: string) {
    exec(`explorer /select,"${path}"`);
}
function unzip(path: string) {
    // const fileName = FileUtils.getFileNameWithoutExtension(path)
    exec(`7z x ${path} -o${FileUtils}`);
}

export default {
    openExplorer,
    unzip
}
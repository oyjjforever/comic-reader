import ePub, { Book } from 'epubjs';
import Navigation from 'epubjs/types/navigation';
import { PackagingMetadataObject } from 'epubjs/types/packaging';
import { SpineItem } from 'epubjs/types/section';

/**
 * @description: 解析epub文件
 * @param {ArrayBuffer} data epub文件Buffer
 * @return {Promise<{ book: Book, metadata: PackagingMetadataObject, navigation: Navigation, spine: SpineItem[] }>} 返回epub解析后的对象
 */
const parse = (data: ArrayBuffer): Promise<{ book: Book, metadata: PackagingMetadataObject, navigation: Navigation, spine: SpineItem[] }> => {
    // 读取epub文件
    const book = ePub(data);

    return new Promise(async (resolve, reject) => {
        try {
            let metadata = await book.loaded.metadata
            let navigation = await book.loaded.navigation
            let spine = await book.loaded.spine

            resolve({ book, metadata, navigation, spine });
        } catch (error) {
            reject(error);
        }
    });
}

const epub = {
    parse,
}

export default epub;
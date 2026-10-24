import { mobileApi } from './mobileApi';

/**
 * 移动端目录（自 fq-reader-chrome src/shared/api/comments.ts 裁剪，
 * 仅保留短剧需要的 all_items 剧集列表，段落评论接口不移植）。
 */

const HOST = 'https://api5-normal-sinfonlineb.fqnovel.com';

export interface MobileChapter {
    itemId: string;
    title?: string;
    version: string;
}

const mobileCatalogCache = new Map<string, MobileChapter[]>();

/** 移动端目录 all_items：短剧的每个 item 即一集（item_id = videoId） */
export async function fetchMobileCatalog(bookId: string): Promise<MobileChapter[]> {
    const hit = mobileCatalogCache.get(bookId);
    if (hit) { return hit; }
    const full =
        `${HOST}/reading/bookapi/directory/all_items/v` +
        `?book_type=0&item_data_list_md5=&catalog_data_md5=&book_id=${bookId}` +
        `&book_info_md5=&need_version=true&device_id={device_id}&ac=wifi&channel=xiaomi_1967_64` +
        `&aid=1967&app_name=novelapp&version_code=65132&version_name=6.5.1.32` +
        `&device_platform=android&os=android&ssmix=a&device_type=FRD-AL10&device_brand=honor` +
        `&language=zh&os_api=28&os_version=9&manifest_version_code=65132` +
        `&resolution=1080*1920&dpi=480&update_version_code=65132&pv_player=65132` +
        `&need_personal_recommend=1&player_so_load=1&is_android_pad_screen=0` +
        `&host_abi=arm64-v8a&dragon_device_type=phone&rom_version=FRD-AL10+8.0.0.556%28C00%29` +
        `&compliance_status=0&iid={install_id}`;

    const json = await mobileApi.signedJsonRequest<{
        data?: { item_data_list?: Array<Record<string, unknown>> };
    }>(full, null, { 'User-Agent': 'com.dragon.read' });

    const list: MobileChapter[] = [];
    for (const raw of json.data?.item_data_list ?? []) {
        const itemId = String(raw.item_id ?? '');
        if (!itemId) { continue; }
        list.push({
            itemId,
            title: typeof raw.title === 'string' ? raw.title : undefined,
            version: String(raw.item_version ?? raw.version ?? '')
        });
    }
    mobileCatalogCache.set(bookId, list);
    return list;
}

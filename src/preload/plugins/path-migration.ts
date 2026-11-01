/**
 * 路径迁移服务：作品移动后同步更新按路径引用的关联记录
 * 覆盖：收藏、评分、文件夹标签、浏览历史、下载历史、精彩片段、视频封面缓存
 */
import path from 'path'
import { ipcRenderer } from 'electron'
import { Database } from 'sqlite'
import database from './sqlite'

let db: Database | null = null

const getDb = async () => {
    if (!db) {
        db = await database.openDatabase()
    }
    return db
}

/** 路径归一化：统一分隔符并小写（Windows 路径不区分大小写）；replace/toLowerCase 均不改变长度，便于按偏移拼接后缀 */
const normalize = (p: string) => p.replaceAll('\\', '/').toLowerCase()

/** 去掉尾部多余分隔符，避免前缀匹配误伤同前缀目录（如 a/b 与 a/b2） */
const trimSep = (p: string) => p.replace(/[\\/]+$/, '')

export interface AffectedSummary {
    favorites: number
    ratings: number
    folderTags: number
    browseHistory: number
    downloadHistory: number
    videoBookmarks: number
    videoCovers: number
}

interface RowWithPath {
    id: number
    path: string
    module?: string
}

const emptySummary = (): AffectedSummary => ({
    favorites: 0,
    ratings: 0,
    folderTags: 0,
    browseHistory: 0,
    downloadHistory: 0,
    videoBookmarks: 0,
    videoCovers: 0
})

/** 精确命中或为旧路径的子孙路径 */
const matchRows = <T extends RowWithPath>(rows: T[], normOld: string): T[] =>
    rows.filter((r) => {
        const n = normalize(r.path)
        return n === normOld || n.startsWith(normOld + '/')
    })

/**
 * 收集各表受影响的行，并汇总其中需要迁移封面缓存的视频文件路径
 * （video_bookmarks 全部是视频；其余表仅 video 模块的 fullPath 是视频文件）
 */
const collectAffected = async (srcPath: string) => {
    const d = await getDb()
    const normOld = normalize(trimSep(srcPath))

    const [favRows, ratingRows, tagRows, browseRows, downloadRows, bookmarkRows] = await Promise.all([
        d.all<RowWithPath[]>('SELECT id, fullPath AS path, module FROM favorites'),
        d.all<RowWithPath[]>('SELECT id, fullPath AS path, module FROM ratings'),
        d.all<RowWithPath[]>('SELECT id, folderPath AS path FROM tags WHERE folderPath IS NOT NULL'),
        d.all<RowWithPath[]>('SELECT id, fullPath AS path, module FROM browse_history'),
        d.all<RowWithPath[]>('SELECT id, fullPath AS path, module FROM download_history'),
        d.all<RowWithPath[]>('SELECT id, video_path AS path FROM video_bookmarks')
    ])

    const favHits = matchRows(favRows, normOld)
    const ratingHits = matchRows(ratingRows, normOld)
    const tagHits = matchRows(tagRows, normOld)
    const browseHits = matchRows(browseRows, normOld)
    const downloadHits = matchRows(downloadRows, normOld)
    const bookmarkHits = matchRows(bookmarkRows, normOld)

    const videoPathSet = new Set<string>()
    bookmarkHits.forEach((r) => videoPathSet.add(r.path))
        ;[favHits, ratingHits, browseHits, downloadHits].forEach((hits) => {
            hits.forEach((hit) => {
                if (hit.module === 'video') {
                    videoPathSet.add(hit.path)
                }
            })
        })

    return {
        favHits,
        ratingHits,
        tagHits,
        browseHits,
        downloadHits,
        bookmarkHits,
        videoPaths: [...videoPathSet]
    }
}

/**
 * 统计移动 srcPath 会影响的关联记录条数（封面缓存仅统计已存在缓存的）
 */
const countAffected = async (srcPath: string): Promise<AffectedSummary> => {
    const affected = await collectAffected(srcPath)
    let videoCovers: string[] = []
    try {
        videoCovers = (await ipcRenderer.invoke(
            'videoCover:existsBatch',
            affected.videoPaths
        )) as string[]
    } catch (error) {
        console.warn('检查视频封面缓存失败:', error)
    }

    return {
        ...emptySummary(),
        favorites: affected.favHits.length,
        ratings: affected.ratingHits.length,
        folderTags: affected.tagHits.length,
        browseHistory: affected.browseHits.length,
        downloadHistory: affected.downloadHits.length,
        videoBookmarks: affected.bookmarkHits.length,
        videoCovers: videoCovers.length
    }
}

/**
 * 移动完成后将关联记录从 srcPath 改写到 destFolderPath 下的新位置
 * （新路径拼法与 systemInterface.movePath 一致：path.join(destFolderPath, basename(srcPath))），
 * 返回各表实际迁移条数
 */
const migrateByMove = async (
    srcPath: string,
    destFolderPath: string
): Promise<AffectedSummary> => {
    const d = await getDb()
    const old = trimSep(srcPath)
    const normOld = normalize(old)
    // 新路径拼法与 systemInterface.movePath 一致；按记录原有前缀的分隔符风格输出，避免迁移后出现混合风格路径
    const joined = path.join(trimSep(destFolderPath), path.basename(old))
    const newPrefixFs = joined
    const newPrefixFwd = joined.replaceAll('\\', '/')
    const prefixFor = (raw: string) =>
        raw.slice(0, old.length).includes('\\') ? newPrefixFs : newPrefixFwd

    const affected = await collectAffected(srcPath)
    const summary = emptySummary()

    // UPDATE OR REPLACE：新路径若已存在同路径的遗留记录（UNIQUE 约束），以本次迁移为准
    const rewrite = async (rows: RowWithPath[], sql: string): Promise<number> => {
        let count = 0
        for (const row of matchRows(rows, normOld)) {
            try {
                await d.run(sql, prefixFor(row.path) + row.path.slice(old.length), row.id)
                count++
            } catch (error) {
                console.warn(`路径迁移失败 (id=${row.id}, ${row.path}):`, error)
            }
        }
        return count
    }

    summary.favorites = await rewrite(affected.favHits, 'UPDATE OR REPLACE favorites SET fullPath = ? WHERE id = ?')
    summary.ratings = await rewrite(affected.ratingHits, 'UPDATE OR REPLACE ratings SET fullPath = ? WHERE id = ?')
    summary.folderTags = await rewrite(affected.tagHits, 'UPDATE OR REPLACE tags SET folderPath = ? WHERE id = ?')
    summary.browseHistory = await rewrite(affected.browseHits, 'UPDATE OR REPLACE browse_history SET fullPath = ? WHERE id = ?')
    summary.downloadHistory = await rewrite(affected.downloadHits, 'UPDATE OR REPLACE download_history SET fullPath = ? WHERE id = ?')
    summary.videoBookmarks = await rewrite(affected.bookmarkHits, 'UPDATE OR REPLACE video_bookmarks SET video_path = ? WHERE id = ?')

    // 视频封面缓存：按 md5(路径) 命名，直接重命名缓存文件，避免移动后重新截帧
    if (affected.videoPaths.length > 0) {
        try {
            const pairs = affected.videoPaths.map((p) => [p, prefixFor(p) + p.slice(old.length)])
            summary.videoCovers = (await ipcRenderer.invoke(
                'videoCover:renameByPaths',
                pairs
            )) as number
        } catch (error) {
            console.warn('迁移视频封面缓存失败:', error)
        }
    }

    return summary
}

export default {
    countAffected,
    migrateByMove
}

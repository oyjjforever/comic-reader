import { Database } from 'sqlite'
import database from './sqlite'

/**
 * 番茄短剧书架表（fanqie_shelf）IPC 桥接。
 * 结构化存储替代 kv JSON：书架条目与观看进度直接落列，便于备份与后续查询。
 */

export interface FanqieShelfBook {
    bookId: string
    title: string
    subtitle?: string
    abstract?: string
    coverUrl?: string
    episodeCount?: number
    tagText?: string
    /** JSON 字符串 [from, to] */
    tagColors?: string
    /** 上次看到第几集（0 起） */
    lastEpisodeIndex?: number
    /** 上次观看时间点（秒） */
    lastTime?: number
    /** 系列各季 JSON：[{bookId,title,lastEpisodeIndex?,lastTime?}]（含主行自身） */
    seasons?: string
    createdAt: number
    updatedAt: number
}

let db: Database | null = null

async function getDb(): Promise<Database> {
    if (!db) {
        db = await database.openDatabase()
    }
    return db
}

function rowToBook(row: Record<string, unknown>): FanqieShelfBook {
    return {
        bookId: String(row.book_id),
        title: String(row.title ?? ''),
        subtitle: (row.subtitle as string) || undefined,
        abstract: (row.abstract as string) || undefined,
        coverUrl: (row.cover_url as string) || undefined,
        episodeCount: row.episode_count === null ? undefined : Number(row.episode_count),
        tagText: (row.tag_text as string) || undefined,
        tagColors: (row.tag_colors as string) || undefined,
        lastEpisodeIndex:
            row.last_episode_index === null || row.last_episode_index === undefined
                ? undefined
                : Number(row.last_episode_index),
        lastTime: row.last_time === null || row.last_time === undefined ? undefined : Number(row.last_time),
        seasons: (row.seasons as string) || undefined,
        createdAt: Number(row.created_at ?? 0),
        updatedAt: Number(row.updated_at ?? 0)
    }
}

/** 全部书架条目（加入时间倒序，与旧 localStorage unshift 顺序一致） */
const getShelf = async (): Promise<FanqieShelfBook[]> => {
    const conn = await getDb()
    const rows = await conn.all<Record<string, unknown>[]>(
        'SELECT * FROM fanqie_shelf ORDER BY created_at DESC'
    )
    return (rows || []).map(rowToBook)
}

/** 加入书架（已存在则更新展示信息与季列表） */
const addBook = async (book: Omit<FanqieShelfBook, 'createdAt' | 'updatedAt'>): Promise<void> => {
    const conn = await getDb()
    const now = Date.now()
    await conn.run(
        `INSERT INTO fanqie_shelf (book_id, title, subtitle, abstract, cover_url, episode_count, tag_text, tag_colors, last_episode_index, last_time, seasons, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_id) DO UPDATE SET
            title = excluded.title,
            subtitle = excluded.subtitle,
            abstract = excluded.abstract,
            cover_url = excluded.cover_url,
            episode_count = excluded.episode_count,
            tag_text = excluded.tag_text,
            tag_colors = excluded.tag_colors,
            seasons = COALESCE(excluded.seasons, seasons),
            updated_at = excluded.updated_at`,
        book.bookId,
        book.title,
        book.subtitle ?? null,
        book.abstract ?? null,
        book.coverUrl ?? null,
        book.episodeCount ?? null,
        book.tagText ?? null,
        book.tagColors ?? null,
        book.lastEpisodeIndex ?? null,
        book.lastTime ?? null,
        book.seasons ?? null,
        now,
        now
    )
}

/** 更新季列表（JSON 字符串整体覆盖） */
const updateSeasons = async (bookId: string, seasonsJson: string): Promise<void> => {
    const conn = await getDb()
    await conn.run(
        'UPDATE fanqie_shelf SET seasons = ?, updated_at = ? WHERE book_id = ?',
        seasonsJson,
        Date.now(),
        bookId
    )
}

/** 移出书架 */
const removeBook = async (bookId: string): Promise<void> => {
    const conn = await getDb()
    await conn.run('DELETE FROM fanqie_shelf WHERE book_id = ?', bookId)
}

/** 更新观看进度 */
const updateProgress = async (
    bookId: string,
    lastEpisodeIndex: number,
    lastTime: number
): Promise<void> => {
    const conn = await getDb()
    await conn.run(
        'UPDATE fanqie_shelf SET last_episode_index = ?, last_time = ?, updated_at = ? WHERE book_id = ?',
        lastEpisodeIndex,
        lastTime,
        Date.now(),
        bookId
    )
}

/** 更新展示信息（封面/简介等自愈回写） */
const updateBookInfo = async (
    bookId: string,
    patch: Pick<FanqieShelfBook, 'title' | 'subtitle' | 'abstract' | 'coverUrl' | 'episodeCount' | 'tagText' | 'tagColors'>
): Promise<void> => {
    const conn = await getDb()
    await conn.run(
        `UPDATE fanqie_shelf SET
            title = COALESCE(?, title),
            subtitle = COALESCE(?, subtitle),
            abstract = COALESCE(?, abstract),
            cover_url = COALESCE(?, cover_url),
            episode_count = COALESCE(?, episode_count),
            tag_text = COALESCE(?, tag_text),
            tag_colors = COALESCE(?, tag_colors),
            updated_at = ?
        WHERE book_id = ?`,
        patch.title ?? null,
        patch.subtitle ?? null,
        patch.abstract ?? null,
        patch.coverUrl ?? null,
        patch.episodeCount ?? null,
        patch.tagText ?? null,
        patch.tagColors ?? null,
        Date.now(),
        bookId
    )
}

export default {
    getShelf,
    addBook,
    removeBook,
    updateProgress,
    updateBookInfo,
    updateSeasons
}

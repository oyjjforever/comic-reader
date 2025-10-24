import sqlite from './sqlite'
import sqlite3 from 'sqlite3'
import { Database } from 'sqlite'

type SpecialAttentionRecord = {
  id?: number
  source: 'pixiv' | 'jmtt' | 'twitter'
  author_id: string
  author_name?: string | null
  extra?: string | null
  created_at?: number
  latest_work_time?: number | null
  latest_work_id?: string | null
  ignored_work_ids?: string | null
  sort?: number
}

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null

async function ensureDb() {
  if (!db) {
    db = await sqlite.openDatabase()
  }
  return db
}

async function init() {
  const _db = await ensureDb()
  await _db.exec(`
    CREATE TABLE IF NOT EXISTS special_attention (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT,
      extra TEXT,
      created_at INTEGER NOT NULL,
      latest_work_time INTEGER,
      latest_work_id TEXT,
      ignored_work_ids TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      UNIQUE(source, author_id)
    )
  `)
  // 迁移：补齐缺失的列（created_at/latest_work_time/ignored_work_ids/sort）
  const cols = await _db.all<{ name: string }[]>(`PRAGMA table_info('special_attention')`)
  const hasCol = (name: string) => Array.isArray(cols) && cols.some((c: any) => c.name === name)

  // created_at：NOT NULL，给旧数据提供默认值并回填
  if (!hasCol('created_at')) {
    await _db.exec(`ALTER TABLE special_attention ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`)
    // 为历史记录回填当前时间戳，避免为 0
    const now = Date.now()
    await _db.run(`UPDATE special_attention SET created_at = ? WHERE created_at IS NULL OR created_at = 0`, [now])
  }

  // latest_work_time：允许为 NULL
  if (!hasCol('latest_work_time')) {
    await _db.exec(`ALTER TABLE special_attention ADD COLUMN latest_work_time INTEGER`)
  }

  // latest_work_id：允许为 NULL（文本，兼容各来源的作品ID）
  if (!hasCol('latest_work_id')) {
    await _db.exec(`ALTER TABLE special_attention ADD COLUMN latest_work_id TEXT`)
  }

  // ignored_work_ids：允许为 NULL
  if (!hasCol('ignored_work_ids')) {
    await _db.exec(`ALTER TABLE special_attention ADD COLUMN ignored_work_ids TEXT`)
  }

  // sort：NOT NULL，默认 0
  if (!hasCol('sort')) {
    await _db.exec(`ALTER TABLE special_attention ADD COLUMN sort INTEGER NOT NULL DEFAULT 0`)
  }
}

async function add(entry: { source: 'pixiv' | 'jmtt' | 'twitter'; authorId: string; authorName?: string; extra?: any; latestWorkTime?: number; latestWorkId?: string; ignoredWorkIds?: string[] }) {
  await init()
  const _db = await ensureDb()
  const createdAt = Date.now()
  const extraStr = entry.extra != null ? JSON.stringify(entry.extra) : null
  const ignoredWorkIdsStr = entry.ignoredWorkIds != null ? JSON.stringify(entry.ignoredWorkIds) : null
  // 将新条目默认置于当前最高优先级（max(sort)+1）
  const maxSortRow = await _db.get<{ maxSort: number }>(`SELECT COALESCE(MAX(sort), 0) AS maxSort FROM special_attention`)
  const sort = ((maxSortRow?.maxSort ?? 0) + 1)
  await _db.run(
    `INSERT OR IGNORE INTO special_attention (source, author_id, author_name, extra, created_at, latest_work_time, latest_work_id, ignored_work_ids, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.source, entry.authorId, entry.authorName ?? null, extraStr, createdAt, entry.latestWorkTime ?? null, entry.latestWorkId ?? null, ignoredWorkIdsStr, sort]
  )
  const row = await _db.get<{ id: number }>(
    `SELECT id FROM special_attention WHERE source = ? AND author_id = ?`,
    [entry.source, entry.authorId]
  )
  return { id: row?.id }
}

async function remove(id: number) {
  await init()
  const _db = await ensureDb()
  await _db.run(`DELETE FROM special_attention WHERE id = ?`, [id])
  return true
}

async function update(id: number, patch: Partial<{ authorName: string; extra: any; latestWorkTime: number; latestWorkId: string; ignoredWorkIds: string[]; sort: number }>) {
  await init()
  const _db = await ensureDb()
  // 允许更新 author_name/extra/latest_work_time/ignored_work_ids
  const sets: string[] = []
  const params: any[] = []
  if (patch.authorName !== undefined) {
    sets.push('author_name = ?')
    params.push(patch.authorName)
  }
  if (patch.extra !== undefined) {
    sets.push('extra = ?')
    params.push(JSON.stringify(patch.extra))
  }
  if (patch.latestWorkTime !== undefined) {
    sets.push('latest_work_time = ?')
    params.push(patch.latestWorkTime)
  }
  if (patch.latestWorkId !== undefined) {
    sets.push('latest_work_id = ?')
    params.push(patch.latestWorkId)
  }
  if (patch.ignoredWorkIds !== undefined) {
    sets.push('ignored_work_ids = ?')
    params.push(JSON.stringify(patch.ignoredWorkIds))
  }
  if (patch.sort !== undefined) {
    sets.push('sort = ?')
    params.push(patch.sort)
  }
  if (!sets.length) return false
  params.push(id)
  await _db.run(`UPDATE special_attention SET ${sets.join(', ')} WHERE id = ?`, params)
  return true
}

async function list() {
  await init()
  const _db = await ensureDb()
  const rows = await _db.all<SpecialAttentionRecord[]>(`SELECT * FROM special_attention ORDER BY sort DESC, created_at DESC`)
  return rows.map((r: any) => ({
    id: r.id,
    source: r.source,
    authorId: r.author_id,
    authorName: r.author_name,
    extra: r.extra ? JSON.parse(r.extra) : null,
    createdAt: r.created_at,
    latestWorkTime: r.latest_work_time,
    latestWorkId: r.latest_work_id,
    ignoredWorkIds: r.ignored_work_ids ? JSON.parse(r.ignored_work_ids) : []
  }))
}

async function increasePriority(id: number, delta: number = 1) {
  await init()
  const _db = await ensureDb()
  await _db.run(`UPDATE special_attention SET sort = sort + ? WHERE id = ?`, [delta, id])
  return true
}

async function decreasePriority(id: number, delta: number = 1) {
  await init()
  const _db = await ensureDb()
  // 防止出现负数
  await _db.run(
    `UPDATE special_attention SET sort = CASE WHEN sort - ? < 0 THEN 0 ELSE sort - ? END WHERE id = ?`,
    [delta, delta, id]
  )
  return true
}

async function swapPriority(id1: number, id2: number) {
  await init()
  const _db = await ensureDb()
  await _db.exec('BEGIN IMMEDIATE')
  try {
    const row1 = await _db.get<{ sort: number }>(`SELECT sort FROM special_attention WHERE id = ?`, [id1])
    const row2 = await _db.get<{ sort: number }>(`SELECT sort FROM special_attention WHERE id = ?`, [id2])
    if (!row1 || !row2) {
      await _db.exec('ROLLBACK')
      return false
    }
    const maxRow = await _db.get<{ maxSort: number }>(`SELECT COALESCE(MAX(sort), 0) AS maxSort FROM special_attention`)
    const temp = (maxRow?.maxSort ?? 0) + 1
    await _db.run(`UPDATE special_attention SET sort = ? WHERE id = ?`, [temp, id1])
    await _db.run(`UPDATE special_attention SET sort = ? WHERE id = ?`, [row1.sort, id2])
    await _db.run(`UPDATE special_attention SET sort = ? WHERE id = ?`, [row2.sort, id1])
    await _db.exec('COMMIT')
    return true
  } catch (e) {
    await _db.exec('ROLLBACK')
    throw e
  }
}

const specialAttention = {
  init,
  add,
  remove,
  update,
  list,
  increasePriority,
  decreasePriority,
  swapPriority
}

export default specialAttention
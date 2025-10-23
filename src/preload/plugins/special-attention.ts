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
      UNIQUE(source, author_id)
    )
  `)
}

async function add(entry: { source: 'pixiv' | 'jmtt' | 'twitter'; authorId: string; authorName?: string; extra?: any }) {
  await init()
  const _db = await ensureDb()
  const createdAt = Date.now()
  const extraStr = entry.extra != null ? JSON.stringify(entry.extra) : null
  await _db.run(
    `INSERT OR IGNORE INTO special_attention (source, author_id, author_name, extra, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [entry.source, entry.authorId, entry.authorName ?? null, extraStr, createdAt]
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

async function update(id: number, patch: Partial<{ authorName: string; extra: any }>) {
  await init()
  const _db = await ensureDb()
  // 仅允许更新 author_name/extra
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
  if (!sets.length) return false
  params.push(id)
  await _db.run(`UPDATE special_attention SET ${sets.join(', ')} WHERE id = ?`, params)
  return true
}

async function list() {
  await init()
  const _db = await ensureDb()
  const rows = await _db.all<SpecialAttentionRecord[]>(`SELECT * FROM special_attention ORDER BY created_at DESC`)
  return rows.map((r: any) => ({
    id: r.id,
    source: r.source,
    authorId: r.author_id,
    authorName: r.author_name,
    extra: r.extra ? JSON.parse(r.extra) : null,
    createdAt: r.created_at
  }))
}

const specialAttention = {
  init,
  add,
  remove,
  update,
  list
}

export default specialAttention
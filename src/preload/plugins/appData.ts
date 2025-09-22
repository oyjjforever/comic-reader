import type { appData as appDataType } from "@/typings/database";
import database from "./sqlite";

// 打开数据库
let db = await database.openDatabase()

/**
 * @description: 获取数据
 * @param {string} key Key
 * @return {Promise<string | undefined>} Value
 */
export async function get(key: string): Promise<string | undefined> {
    // 查询数据
    let data = await db.get<appDataType>(`SELECT * FROM app_data WHERE key = ?`, key)

    // 如果数据不存在
    if (!data) {
        return undefined
    } else {
        return data.value
    }
}

/**
 * @description: 设置数据
 * @param {string} key Key
 * @param {string} value Value
 * @return {Promise<void>} 返回Promise
 */
export async function set(key: string, value: string): Promise<void> {
    // 查询数据
    let data = await get(key)

    // 如果数据不存在
    if (!data) {
        // 插入数据
        await db.run(`INSERT INTO app_data (key, value) VALUES (?, ?)`, key, value)
    } else {
        // 更新数据
        await db.run(`UPDATE app_data SET value = ? WHERE key = ?`, value, key)
    }
}

export default {
    get,
    set,
}
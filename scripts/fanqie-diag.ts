/**
 * 番茄短剧移植诊断脚本（纯 Node 运行，不依赖 Electron）：
 * 1. 用 fq-reader-chrome 的黄金向量验证签名移植（sm3/ladon/argus/protobuf）
 * 2. 真实 API 链路：设备注册 → 搜索 → 剧集列表 → video_model → 下载解密落盘
 *
 * 用法：
 *   node scripts/fanqie-diag.mjs            # 全链路（含真实 API）
 *   node scripts/fanqie-diag.mjs --vectors  # 仅黄金向量
 * 打包：见 package.json scripts.diag（esbuild bundle）
 */
import { Buffer } from 'buffer'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const VECTORS_PATH = 'W:/Workplace/fq-reader-chrome/test/vectors.json'

async function main() {
    const { sm3, ProtoBuf, argusBodyHash, argusQueryHash, argusEncryptLegacy, ladonEncrypt } =
        await import('../src/preload/plugins/fanqie/sign')

    const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8'))
    let failed = 0
    const check = (name: string, actual: string, expected: string) => {
        const ok = actual === expected
        if (!ok) failed++
        console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  actual:   ${actual}\n  expected: ${expected}`}`)
    }

    check('sm3(empty)', sm3(Buffer.alloc(0)).toString('hex'), vectors.sm3.empty)
    check('sm3(abc)', sm3(Buffer.from('abc')).toString('hex'), vectors.sm3.abc)
    check('sm3(zero16)', sm3(Buffer.alloc(16)).toString('hex'), vectors.sm3.zero16)
    check('argus_bodyhash(null)', argusBodyHash('').toString('hex'), vectors.argus_bodyhash.null)
    check('argus_queryhash(null)', argusQueryHash('').toString('hex'), vectors.argus_queryhash.null)
    check(
        'ladon',
        ladonEncrypt(vectors.ladon.khronos, vectors.ladon.lcId, vectors.ladon.aid, Buffer.from(vectors.ladon.randomBytes, 'hex')),
        vectors.ladon.result
    )

    const buildBean = () => {
        const bean = new ProtoBuf()
        bean.putVarint(1, 1077940818)
        bean.putVarint(2, 2)
        bean.putVarint(3, 305419896)
        bean.putUtf8(4, '1967')
        bean.putUtf8(5, 'test_device_id')
        bean.putUtf8(6, '1611921764')
        bean.putUtf8(7, '')
        bean.putUtf8(8, '')
        bean.putVarint(9, 0)
        bean.putUtf8(10, '')
        bean.putUtf8(11, '')
        bean.putVarint(12, 1700000000 * 2)
        bean.putBytes(13, Buffer.from(vectors.argus_bodyhash.null, 'hex'))
        bean.putBytes(14, Buffer.from('ac5095fc674e', 'hex'))
        const sub15 = new ProtoBuf()
        sub15.putVarint(1, 1); sub15.putVarint(2, 1); sub15.putVarint(3, 1); sub15.putVarint(7, 0xc792eccc)
        bean.putProtobuf(15, sub15)
        bean.putUtf8(16, '')
        bean.putUtf8(20, 'none')
        bean.putVarint(21, 738)
        const sub23 = new ProtoBuf()
        sub23.putUtf8(1, 'NX551J'); sub23.putVarint(2, 8196); sub23.putVarint(4, 0x80e0d800)
        bean.putProtobuf(23, sub23)
        bean.putVarint(25, 2)
        return bean
    }
    check('protobuf_bean', buildBean().toBuf().toString('hex'), vectors.protobuf_bean)
    check('argus_encrypt(legacy)', argusEncryptLegacy(buildBean().toBuf()), vectors.argus_encrypt.result)

    if (failed > 0) {
        console.error(`\n${failed} 个向量验证失败，中止真实 API 测试`)
        process.exit(1)
    }
    console.log('全部签名黄金向量通过\n')

    if (process.argv.includes('--vectors')) return

    // ===== 真实 API 链路 =====
    const { searchDramas, fetchDramaEpisodes, ensureEpisodeFile } = await import('../src/preload/plugins/fanqie/drama')
    const { setCacheRoot } = await import('../src/preload/plugins/fanqie/cache')
    setCacheRoot(path.join(os.tmpdir(), 'fanqie-diag-cache'))

    console.log('[1] 搜索短剧 ...')
    const results = await searchDramas('总裁')
    console.log(`    找到 ${results.length} 部：${results.slice(0, 3).map((r) => `${r.title}(${r.subtitle || '?'})`).join(' / ')}`)
    if (results.length === 0) throw new Error('搜索无结果')
    const seriesId = results[0].bookId

    console.log('[2] 拉取剧集列表 ...')
    const eps = await fetchDramaEpisodes(seriesId)
    console.log(`    共 ${eps.length} 集，第一集 videoId=${eps[0]?.videoId}`)
    if (eps.length === 0) throw new Error('剧集列表为空')

    console.log('[3] 下载并解密第一集（全量，可能较大）...')
    const t0 = Date.now()
    const result = await ensureEpisodeFile(seriesId, eps[0].videoId, 0, (p) => {
        if (p.stage === 'download' && p.total) {
            const pct = ((p.got! / p.total) * 100).toFixed(1)
            process.stdout.write(`\r    下载 ${pct}% (${(p.got! / 1048576).toFixed(1)}/${(p.total / 1048576).toFixed(1)}MB)`)
        } else if (p.stage !== 'download') {
            process.stdout.write(`\n    阶段: ${p.stage}`)
        }
    })
    console.log(`\n    完成: codec=${result.codec} 用时=${((Date.now() - t0) / 1000).toFixed(1)}s\n    文件: ${result.path}`)
    console.log('\n真实链路全部通过 ✅')
}

main().catch((e) => {
    console.error('\n诊断失败:', e?.message || e)
    process.exit(1)
})

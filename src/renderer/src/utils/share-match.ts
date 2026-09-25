/**
 * 分享匹配工具：核心标题提取、归一化比较、匹配片段定位
 */

// 从完整文件名中提取核心标题用于搜索
// 例：[OrangeMaru (YD)] 真夏の夜の夢 (アイドルマスター シャイニーカラーズ) [中國翻譯] [DL版]-1 → 真夏の夜の夢
export const extractShareKeyword = (name: string): string => {
  const text = (name || '')
    .replace(/\.[^.]+$/, '') // 去除扩展名
    // 去除方括号/圆括号/全角括号块（作者、汉化组、原作、版本等修饰信息）
    .replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）|【[^】]*】/g, ' ')
    .replace(/-\d+\s*$/, '') // 去除结尾的分卷/页码，如 -1
    // 去除首尾的连接符与空白等符号噪音
    .replace(/^[\s\-_—–~|+.,!！。、]+|[\s\-_—–~|+.,!！。、]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text || (name || '').replace(/\.[^.]+$/, '').trim()
}

// 格式化为与本地文件夹名一致的格式（与下载时的 simpleSanitize 规则相同）后再比较
export const normalizeForMatch = (text: string): string => {
  const sanitized = window.file?.simpleSanitize?.(text ?? '') ?? (text || '')
  return sanitized.replace(/\s+/g, ' ').trim()
}

// 最长公共子串（用于计算匹配片段与高亮显示）
export const longestCommonSubstring = (a: string, b: string): string => {
  if (!a || !b) return ''
  let best = ''
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1
        if (cur[j] > best.length) best = a.slice(i - cur[j], i)
      }
    }
    prev = cur
  }
  return best
}

// 在完整标题中定位与本地作品名匹配的所有片段（贪心扫描，返回 [起始, 结束) 下标数组）
// 对完整标题与完整本地作品名归一化后直接对比，包括括号内的作者、原作等修饰信息
export const findHighlightRanges = (title: string, localName: string): Array<[number, number]> => {
  const full = normalizeForMatch(title)
  const local = normalizeForMatch(localName)
  if (!full || !local) return []
  const ranges: Array<[number, number]> = []
  let i = 0
  while (i < full.length) {
    // 从 i 开始找最长的存在于本地作品名中的子串（至少 2 个字符）
    let matched = ''
    for (let len = full.length - i; len >= 2; len--) {
      const seg = full.slice(i, i + len)
      if (local.includes(seg)) {
        matched = seg
        break
      }
    }
    if (matched) {
      const idx = title.indexOf(matched)
      if (idx >= 0) ranges.push([idx, idx + matched.length])
      i += matched.length
    } else {
      i++
    }
  }
  return ranges
}

// 将标题按匹配片段切分为高亮/非高亮片段（用于渲染）
export const buildTitleSegments = (
  title: string,
  localName: string
): Array<{ text: string; highlight: boolean }> | null => {
  if (!title) return null
  const ranges = findHighlightRanges(title, localName)
  if (ranges.length === 0) return null
  const segments: Array<{ text: string; highlight: boolean }> = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: title.slice(cursor, start), highlight: false })
    segments.push({ text: title.slice(start, end), highlight: true })
    cursor = end
  }
  if (cursor < title.length) segments.push({ text: title.slice(cursor), highlight: false })
  return segments
}

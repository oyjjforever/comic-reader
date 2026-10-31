/**
 * 全量目录树共享模块：move-dialog 与「随机打开」共用同一份模块级缓存与构建逻辑，
 * 任一处构建后另一处直接复用；弹窗内新建/删除直接改树对象（引用共享，缓存自动同步）。
 * 构建方式与 move-dialog 原实现一致：递归 getFolderTree（不过滤形态，含最叶节点）逐层拉取。
 */
export interface FullTreeNode {
  name: string
  fullPath: string
  isRoot: boolean
  /** 无子目录（作品层） */
  isLeaf: boolean
  children: FullTreeNode[]
  /** move-dialog 使用：节点是否禁选（随机等场景无需设置） */
  disabled?: boolean
}

/** 全量树模块级缓存（key: namespace|资源根列表） */
export const moduleTreeCache = new Map<string, FullTreeNode[]>()

export const treeCacheKey = (namespace: string, roots: string[]) =>
  `${namespace}|${roots.join('||')}`

export async function buildFullTree(roots: string[]): Promise<FullTreeNode[]> {
  const buildNode = async (path: string, name?: string, isRoot = false): Promise<FullTreeNode> => {
    let folders: any[] = []
    try {
      folders = await window.media.getFolderTree(path, false)
    } catch {
      /* 单个分支失败跳过 */
    }
    const children = await Promise.all(
      folders.map((c: any) => buildNode(c.fullPath, c.name))
    )
    return {
      name: name ?? path,
      fullPath: path,
      isRoot,
      isLeaf: children.length === 0,
      children
    }
  }
  return Promise.all(roots.map((p) => buildNode(p, p, true)))
}

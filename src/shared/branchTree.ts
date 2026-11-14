import type { Branch } from './git'

export interface BranchTreeNode {
  /** The last path segment, e.g. "login" for "feature/login". */
  name: string
  /** The full path, unique within the tree. Use it as a React key. */
  path: string
  /** Set for leaves (actual branches); null for folders. */
  branch: Branch | null
  children: BranchTreeNode[]
}

/**
 * Groups branches into folders by "/" in their names, so "feature/a" and
 * "feature/b" become a "feature" folder with two leaves. Order follows the
 * input order of the first branch in each folder.
 */
export function buildBranchTree(branches: readonly Branch[]): BranchTreeNode[] {
  const root: BranchTreeNode = { name: '', path: '', branch: null, children: [] }

  for (const branch of branches) {
    let parent = root
    const segments = branch.name.split('/')
    segments.forEach((segment, i) => {
      const path = segments.slice(0, i + 1).join('/')
      const isLeaf = i === segments.length - 1
      let node = parent.children.find((child) => child.name === segment && !child.branch)
      if (isLeaf || !node) {
        node = { name: segment, path, branch: isLeaf ? branch : null, children: [] }
        parent.children.push(node)
      }
      parent = node
    })
  }

  return root.children
}

/** Whether this node is, or contains, the checked-out branch. */
export function containsCurrentBranch(node: BranchTreeNode): boolean {
  if (node.branch) return node.branch.isCurrent
  return node.children.some(containsCurrentBranch)
}

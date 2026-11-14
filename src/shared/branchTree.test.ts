import { describe, expect, it } from 'vitest'
import { buildBranchTree, containsCurrentBranch } from './branchTree'
import type { Branch } from './git'

const branch = (name: string, isCurrent = false): Branch => ({
  name,
  isCurrent,
  shortOid: 'abc1234',
  upstream: null,
  upstreamGone: false,
  ahead: 0,
  behind: 0
})

/** A compact view of the tree: folders end in "/". */
function outline(nodes: ReturnType<typeof buildBranchTree>): unknown[] {
  return nodes.map((node) =>
    node.branch ? node.name : { [`${node.name}/`]: outline(node.children) }
  )
}

describe('buildBranchTree', () => {
  it('groups branches into folders and keeps input order', () => {
    const tree = buildBranchTree([
      branch('main'),
      branch('feature/login'),
      branch('fix'),
      branch('feature/ui/header'),
      branch('feature/api')
    ])

    expect(outline(tree)).toEqual([
      'main',
      { 'feature/': ['login', { 'ui/': ['header'] }, 'api'] },
      'fix'
    ])
  })

  it('gives every node a unique full path', () => {
    const tree = buildBranchTree([branch('a/b/c'), branch('a/d')])
    const folder = tree[0]
    expect(folder.path).toBe('a')
    expect(folder.children.map((child) => child.path)).toEqual(['a/b', 'a/d'])
    expect(folder.children[0].children[0]).toMatchObject({ path: 'a/b/c', name: 'c' })
  })

  it('returns an empty tree for no branches', () => {
    expect(buildBranchTree([])).toEqual([])
  })
})

describe('containsCurrentBranch', () => {
  it('finds the current branch inside nested folders', () => {
    const [main, feature] = buildBranchTree([branch('main'), branch('feature/x/y', true)])
    expect(containsCurrentBranch(main)).toBe(false)
    expect(containsCurrentBranch(feature)).toBe(true)
  })
})

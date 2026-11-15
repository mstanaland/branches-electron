import { describe, expect, it } from 'vitest'
import type { FileChange } from './git'
import { sortChanges, splitPath, stagingState } from './changes'

const change = (overrides: Partial<FileChange> & { path: string }): FileChange => ({
  originalPath: null,
  index: 'unmodified',
  worktree: 'modified',
  kind: 'ordinary',
  ...overrides
})

describe('stagingState', () => {
  it('is staged when only the index differs', () => {
    expect(stagingState(change({ path: 'a', index: 'modified', worktree: 'unmodified' }))).toBe(
      'staged'
    )
  })

  it('is unstaged when only the work tree differs', () => {
    expect(stagingState(change({ path: 'a' }))).toBe('unstaged')
  })

  it('is partially staged when both sides differ', () => {
    expect(stagingState(change({ path: 'a', index: 'added', worktree: 'modified' }))).toBe(
      'partial'
    )
  })

  it('is unstaged for an untracked file', () => {
    expect(
      stagingState(change({ path: 'a', index: null, worktree: null, kind: 'untracked' }))
    ).toBe('unstaged')
  })

  it('is unstaged for a conflict, which cannot be staged yet', () => {
    expect(
      stagingState(change({ path: 'a', index: 'unmerged', worktree: 'unmerged', kind: 'unmerged' }))
    ).toBe('unstaged')
  })
})

describe('sortChanges', () => {
  it('puts conflicts first, then orders by path', () => {
    const sorted = sortChanges([
      change({ path: 'b.txt' }),
      change({ path: 'z.txt', kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' }),
      change({ path: 'a.txt' })
    ])

    expect(sorted.map((c) => c.path)).toEqual(['z.txt', 'a.txt', 'b.txt'])
  })

  it('does not change the list it was given', () => {
    const input = [change({ path: 'b' }), change({ path: 'a' })]
    sortChanges(input)

    expect(input.map((c) => c.path)).toEqual(['b', 'a'])
  })

  it('drops ignored files, which are not changes', () => {
    const sorted = sortChanges([
      change({ path: 'a' }),
      change({ path: 'build', kind: 'ignored', index: null, worktree: null })
    ])

    expect(sorted.map((c) => c.path)).toEqual(['a'])
  })

  it('orders paths by code point so the order does not depend on locale', () => {
    const sorted = sortChanges([
      change({ path: 'b' }),
      change({ path: 'B' }),
      change({ path: 'a' })
    ])

    expect(sorted.map((c) => c.path)).toEqual(['B', 'a', 'b'])
  })
})

describe('splitPath', () => {
  it('splits a name from its folder', () => {
    expect(splitPath('src/app/main.ts')).toEqual({ folder: 'src/app/', name: 'main.ts' })
  })

  it('has no folder for a file at the top', () => {
    expect(splitPath('README.md')).toEqual({ folder: '', name: 'README.md' })
  })

  it('keeps spaces', () => {
    expect(splitPath('my docs/a b.txt')).toEqual({ folder: 'my docs/', name: 'a b.txt' })
  })
})

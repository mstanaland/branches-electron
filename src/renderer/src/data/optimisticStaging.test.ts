import { describe, expect, it } from 'vitest'
import { stagingState } from '../../../shared/changes'
import type { FileChange } from '../../../shared/git'
import { predictStaged, predictUnstaged } from './optimisticStaging'

const change = (overrides: Partial<FileChange> = {}): FileChange => ({
  path: 'a.txt',
  originalPath: null,
  index: 'unmodified',
  worktree: 'modified',
  kind: 'ordinary',
  ...overrides
})

describe('predictStaged', () => {
  it.each([
    ['a modification', change()],
    ['a deletion', change({ worktree: 'deleted' })],
    ['an untracked file', change({ index: null, worktree: null, kind: 'untracked' })],
    ['a partially staged change', change({ index: 'modified', worktree: 'modified' })]
  ])('shows %s as staged', (_name, input) => {
    expect(stagingState(predictStaged(input))).toBe('staged')
  })

  it('keeps an untracked file in the list as an addition', () => {
    const staged = predictStaged(change({ index: null, worktree: null, kind: 'untracked' }))
    expect(staged).toMatchObject({ path: 'a.txt', index: 'added', kind: 'ordinary' })
  })

  it('leaves a conflict alone', () => {
    const conflict = change({ kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' })
    expect(predictStaged(conflict)).toEqual(conflict)
  })
})

describe('predictUnstaged', () => {
  it.each([
    ['a staged modification', change({ index: 'modified', worktree: 'unmodified' })],
    ['a staged deletion', change({ index: 'deleted', worktree: 'unmodified' })],
    ['a partially staged change', change({ index: 'modified', worktree: 'modified' })]
  ])('shows %s as unstaged', (_name, input) => {
    expect(stagingState(predictUnstaged(input))).toBe('unstaged')
  })

  it('shows an unstaged addition as untracked again', () => {
    const unstaged = predictUnstaged(change({ index: 'added', worktree: 'unmodified' }))
    expect(unstaged).toMatchObject({
      path: 'a.txt',
      kind: 'untracked',
      index: null,
      worktree: null
    })
  })

  it('leaves a conflict alone', () => {
    const conflict = change({ kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' })
    expect(predictUnstaged(conflict)).toEqual(conflict)
  })
})

import { describe, expect, it } from 'vitest'
import type { DiffHunk, DiffLine, FileDiff } from '../../../shared/git'
import { diffSummary } from './diffSummary'

function line(kind: DiffLine['kind']): DiffLine {
  return { kind, oldNumber: null, newNumber: null, text: '', noNewline: false }
}

function hunk(...kinds: DiffLine['kind'][]): DiffHunk {
  return { header: '@@', lines: kinds.map(line) }
}

function text(hunks: DiffHunk[], truncated = false): FileDiff {
  return { binary: false, hunks, truncated }
}

describe('diffSummary', () => {
  it('counts hunks, insertions and deletions', () => {
    const diff = text([
      hunk('context', 'added', 'added', 'removed'),
      hunk('added'),
      hunk('context', 'added')
    ])

    expect(diffSummary(diff)).toBe('3 hunks, 4 insertions, 1 deletion')
  })

  it('uses the singular for one of each', () => {
    expect(diffSummary(text([hunk('removed', 'added')]))).toBe('1 hunk, 1 insertion, 1 deletion')
  })

  it('says a truncated diff was truncated rather than counting part of it', () => {
    expect(diffSummary(text([hunk('added')], true))).toBe(
      'Diff truncated: too large to count in full'
    )
  })

  it('has nothing to say about a binary file or a change with no hunks', () => {
    expect(diffSummary({ binary: true })).toBeNull()
    expect(diffSummary(text([]))).toBeNull()
  })
})

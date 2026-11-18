import { describe, expect, it } from 'vitest'
import type { PublishTarget } from './git'
import { defaultPublishRemote } from './publish'

function target(names: string[], goneFrom: string | null = null): PublishTarget {
  return {
    branch: 'feature',
    remotes: names.map((name) => ({ name, url: null, hasBranch: false })),
    goneFrom
  }
}

describe('defaultPublishRemote', () => {
  it('prefers the remote a gone upstream was on', () => {
    expect(defaultPublishRemote(target(['fork', 'origin'], 'fork'))).toBe('fork')
  })

  it('falls back to origin', () => {
    expect(defaultPublishRemote(target(['backup', 'origin']))).toBe('origin')
  })

  it('ignores a gone remote that no longer exists', () => {
    expect(defaultPublishRemote(target(['backup', 'origin'], 'deleted'))).toBe('origin')
  })

  it('takes the first remote when there is no origin', () => {
    expect(defaultPublishRemote(target(['backup', 'fork']))).toBe('backup')
  })

  it('is null with no remotes', () => {
    expect(defaultPublishRemote(target([]))).toBeNull()
  })
})

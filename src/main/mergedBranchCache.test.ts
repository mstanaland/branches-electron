import { describe, expect, it, vi } from 'vitest'
import type { MergedBranch } from '../shared/github'
import { createMergedBranchCache, type MergedBranchCacheDeps } from './mergedBranchCache'

function merged(name: string, number = 7): MergedBranch {
  return {
    name,
    pullRequest: {
      number,
      title: `Pull request ${number}`,
      url: `https://github.com/octo/hello/pull/${number}`,
      baseBranch: 'main',
      mergedAt: '2026-11-01T10:00:00Z',
      headOid: 'a'.repeat(40)
    }
  }
}

/** A cache whose GitHub answers come from `answers`, one per lookup, the last one repeating. */
function setup(...answers: Array<MergedBranch[] | null | Error>) {
  let call = 0
  const find = vi.fn<MergedBranchCacheDeps['find']>(async () => {
    const answer = answers[Math.min(call++, answers.length - 1)]
    if (answer instanceof Error) throw answer
    return answer ?? null
  })
  const onChanged = vi.fn<MergedBranchCacheDeps['onChanged']>()
  return { find, onChanged, cache: createMergedBranchCache({ find, onChanged }) }
}

describe('createMergedBranchCache', () => {
  it('looks up a repository once, then serves what it found', async () => {
    const { find, cache } = setup([merged('feature')])

    await expect(cache.get('/repo')).resolves.toEqual([merged('feature')])
    await expect(cache.get('/repo')).resolves.toEqual([merged('feature')])

    expect(find).toHaveBeenCalledTimes(1)
  })

  it('reports a recompute that changed the result, and serves the new one', async () => {
    const { cache, onChanged } = setup([], [merged('feature')])
    await cache.get('/repo')

    await cache.recompute('/repo')

    expect(onChanged).toHaveBeenCalledWith('/repo')
    await expect(cache.get('/repo')).resolves.toEqual([merged('feature')])
  })

  it('reports nothing when a recompute found the same as before', async () => {
    const { cache, find, onChanged } = setup([merged('feature'), merged('other', 8)])
    await cache.get('/repo')

    await cache.recompute('/repo')

    expect(find).toHaveBeenCalledTimes(2)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it.each([
    ['GitHub couldn’t be asked', null],
    ['the lookup threw', new Error('git exploded')]
  ])('keeps the last good result when %s', async (_case, failure) => {
    const { cache, onChanged } = setup([merged('feature')], failure)
    await cache.get('/repo')

    await expect(cache.recompute('/repo')).resolves.toBeUndefined()

    expect(onChanged).not.toHaveBeenCalled()
    await expect(cache.get('/repo')).resolves.toEqual([merged('feature')])
  })

  it('serves an empty result when the first lookup fails, and tries again on the next read', async () => {
    const { cache, find } = setup(new Error('offline'), [merged('feature')])

    await expect(cache.get('/repo')).resolves.toEqual([])
    await expect(cache.get('/repo')).resolves.toEqual([merged('feature')])
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('drops a deleted branch at once and reports it, without waiting for GitHub', async () => {
    const { cache, find, onChanged } = setup([merged('feature'), merged('other', 8)])
    await cache.get('/repo')

    cache.branchDeleted('/repo', 'feature')

    expect(onChanged).toHaveBeenCalledWith('/repo')
    await expect(cache.get('/repo')).resolves.toEqual([merged('other', 8)])
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('reports nothing when the deleted branch wasn’t merged', async () => {
    const { cache, onChanged } = setup([merged('feature')])
    await cache.get('/repo')

    cache.branchDeleted('/repo', 'unrelated')

    expect(onChanged).not.toHaveBeenCalled()
  })

  it('never lets a lookup that started before a delete bring the branch back', async () => {
    let release: ((merged: MergedBranch[]) => void) | undefined
    const { cache, find } = setup([merged('feature')])
    await cache.get('/repo')
    find.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))

    const stale = cache.recompute('/repo')
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(2))
    cache.branchDeleted('/repo', 'feature')
    release?.([merged('feature')])
    await stale

    await expect(cache.get('/repo')).resolves.toEqual([])
  })

  it('runs one lookup of a repository at a time, the later one winning', async () => {
    let release: ((merged: MergedBranch[]) => void) | undefined
    const { cache, find } = setup([merged('newer')])
    find.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))

    const first = cache.recompute('/repo')
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(1))
    const second = cache.recompute('/repo')
    release?.([merged('older')])
    await Promise.all([first, second])

    expect(find).toHaveBeenCalledTimes(2)
    await expect(cache.get('/repo')).resolves.toEqual([merged('newer')])
  })

  it('folds recomputes made while one is waiting its turn into that one', async () => {
    let release: ((merged: MergedBranch[]) => void) | undefined
    const { cache, find } = setup([merged('newer')])
    find.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))

    const running = cache.recompute('/repo')
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(1))
    const queued = cache.recompute('/repo')
    const joined = cache.recompute('/repo')
    expect(joined).toBe(queued)
    release?.([merged('older')])
    await Promise.all([running, queued, joined])

    expect(find).toHaveBeenCalledTimes(2)
    await expect(cache.get('/repo')).resolves.toEqual([merged('newer')])
  })

  it('drops what a lookup found when the repository was removed while it ran', async () => {
    let release: ((merged: MergedBranch[]) => void) | undefined
    const { cache, find, onChanged } = setup([])
    find.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))

    const running = cache.recompute('/repo')
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(1))
    cache.forget('/repo')
    release?.([merged('feature')])
    await running

    expect(onChanged).not.toHaveBeenCalled()
    await expect(cache.get('/repo')).resolves.toEqual([])
  })

  it('forgets a repository the user removed', async () => {
    const { cache, find } = setup([merged('feature')])
    await cache.get('/repo')

    cache.forget('/repo')
    await cache.get('/repo')

    expect(find).toHaveBeenCalledTimes(2)
  })
})

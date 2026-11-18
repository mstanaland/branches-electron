import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRemote, hasRemote, type FetchResult } from './git'
import { listBranches } from './git/branches'
import { cleanupTestRepos, cloneRepo, createRepoWithCommit } from './git/test-repo'
import { createFetchScheduler, type FetchSchedulerDeps } from './fetchScheduler'

const INTERVAL = 60_000

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
afterAll(cleanupTestRepos)

function setup(overrides: Partial<FetchSchedulerDeps> = {}) {
  const deps = {
    hasRemote: vi.fn<FetchSchedulerDeps['hasRemote']>().mockResolvedValue(true),
    fetch: vi.fn<FetchSchedulerDeps['fetch']>().mockResolvedValue({ changed: false }),
    onRefsChanged: vi.fn<FetchSchedulerDeps['onRefsChanged']>(),
    intervalMs: INTERVAL,
    ...overrides
  }
  return { deps, scheduler: createFetchScheduler(deps) }
}

/** Lets the chained promises settle without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0)

describe('createFetchScheduler', () => {
  it('fetches as soon as a repository becomes active and the window is focused', async () => {
    const { deps, scheduler } = setup()
    scheduler.setFocused(true)

    scheduler.setActiveRepository('/repo')
    await settle()

    expect(deps.fetch).toHaveBeenCalledWith('/repo')
    expect(deps.fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches again once the interval has passed', async () => {
    const { deps, scheduler } = setup()
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()

    await vi.advanceTimersByTimeAsync(INTERVAL)

    expect(deps.fetch).toHaveBeenCalledTimes(2)
  })

  it('fetches nothing while the window is unfocused', async () => {
    const { deps, scheduler } = setup()

    scheduler.setActiveRepository('/repo')
    await vi.advanceTimersByTimeAsync(INTERVAL * 5)

    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('stops fetching when the window loses focus, and picks up again when it returns', async () => {
    const { deps, scheduler } = setup()
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()
    expect(deps.fetch).toHaveBeenCalledTimes(1)

    scheduler.setFocused(false)
    await vi.advanceTimersByTimeAsync(INTERVAL * 5)
    expect(deps.fetch).toHaveBeenCalledTimes(1)

    scheduler.setFocused(true)
    await settle()
    expect(deps.fetch).toHaveBeenCalledTimes(2)
  })

  it('skips a tick while a fetch is still in flight', async () => {
    const pending: ((result: FetchResult) => void)[] = []
    const fetch = vi
      .fn<FetchSchedulerDeps['fetch']>()
      .mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const finish = (): void => pending.forEach((resolve) => resolve({ changed: false }))
    const { scheduler } = setup({ fetch })
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)

    // Anything that would start a tick — app switching, time passing — must not start a second.
    scheduler.setFocused(false)
    scheduler.setFocused(true)
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)
    expect(fetch).toHaveBeenCalledTimes(1)

    // The next one is chained behind the one in flight.
    finish()
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('schedules nothing for a repository with no remote, and asks git only once', async () => {
    const checkRemote = vi.fn<FetchSchedulerDeps['hasRemote']>().mockResolvedValue(false)
    const { deps, scheduler } = setup({ hasRemote: checkRemote })
    scheduler.setFocused(true)

    scheduler.setActiveRepository('/local-only')
    await vi.advanceTimersByTimeAsync(INTERVAL * 10)

    expect(deps.fetch).not.toHaveBeenCalled()
    expect(checkRemote).toHaveBeenCalledTimes(1)
  })

  it('reports a refresh only when the fetch moved a ref', async () => {
    const fetch = vi
      .fn<FetchSchedulerDeps['fetch']>()
      .mockResolvedValueOnce({ changed: false })
      .mockResolvedValue({ changed: true })
    const { deps, scheduler } = setup({ fetch })
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()
    expect(deps.onRefsChanged).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(INTERVAL)

    expect(deps.onRefsChanged).toHaveBeenCalledWith('/repo')
  })

  it('backs off after repeated failures instead of retrying every interval', async () => {
    const fetch = vi
      .fn<FetchSchedulerDeps['fetch']>()
      .mockRejectedValue(new Error('could not read from remote repository'))
    const { scheduler } = setup({ fetch })
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)

    // Second attempt comes at the normal interval, the third only after twice that.
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('returns to the normal interval once a fetch succeeds', async () => {
    const fetch = vi
      .fn<FetchSchedulerDeps['fetch']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ changed: false })
    const { scheduler } = setup({ fetch })
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()

    // Two failures, so the third attempt waits twice the interval.
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(INTERVAL * 2)
    expect(fetch).toHaveBeenCalledTimes(3)

    // That one succeeded, so the next is back at the normal interval.
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('fetches the new repository and leaves the old one alone when the active one changes', async () => {
    const fetch = vi.fn<FetchSchedulerDeps['fetch']>().mockResolvedValue({ changed: false })
    const { scheduler } = setup({ fetch })
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/one')
    await settle()

    scheduler.setActiveRepository('/two')
    await settle()
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)

    const roots = fetch.mock.calls.map(([root]) => root)
    // The old repository was fetched once, when it was active, and never again after.
    expect(roots.filter((root) => root === '/one')).toEqual(['/one'])
    expect(roots.indexOf('/two')).toBe(1)
    expect(roots.filter((root) => root === '/two').length).toBeGreaterThan(1)
  })

  it('fetches a repository that became active while a fetch was in flight', async () => {
    const pending: ((result: FetchResult) => void)[] = []
    const fetch = vi
      .fn<FetchSchedulerDeps['fetch']>()
      .mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const { scheduler } = setup({ fetch })
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/one')
    await settle()

    scheduler.setActiveRepository('/two')
    pending.forEach((resolve) => resolve({ changed: false }))
    await vi.advanceTimersByTimeAsync(0)

    expect(fetch).toHaveBeenLastCalledWith('/two')
  })

  it('fetches nothing once there is no active repository', async () => {
    const { deps, scheduler } = setup()
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()

    scheduler.setActiveRepository(null)
    await vi.advanceTimersByTimeAsync(INTERVAL * 5)

    expect(deps.fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches nothing after it is stopped', async () => {
    const { deps, scheduler } = setup()
    scheduler.setFocused(true)
    scheduler.setActiveRepository('/repo')
    await settle()

    scheduler.stop()
    await vi.advanceTimersByTimeAsync(INTERVAL * 5)

    expect(deps.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('createFetchScheduler against real repositories', () => {
  // Real git over a real local remote, so the whole path is exercised once.
  beforeEach(() => vi.useRealTimers())

  it('notices a commit pushed upstream while the app is open, and reports the branch behind', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    const changed: string[] = []
    const scheduler = createFetchScheduler({
      hasRemote,
      fetch: fetchRemote,
      onRefsChanged: (root) => changed.push(root),
      intervalMs: 20
    })
    scheduler.setFocused(true)
    scheduler.setActiveRepository(clone.root)
    // The first tick, right after the repository becomes active, finds nothing new.
    await retryUntil(async () => {
      const main = (await listBranches(clone.root)).find((branch) => branch.name === 'main')
      expect(main?.behind).toBe(0)
    })

    await origin.write('merged.txt')
    await origin.commit('Merged upstream')

    await retryUntil(async () => {
      expect(changed).toEqual([clone.root])
      const main = (await listBranches(clone.root)).find((branch) => branch.name === 'main')
      expect(main?.behind).toBe(1)
    })
    scheduler.stop()
  })
})

/** Retries `check` until it stops throwing. This is main-process code, so no testing-library. */
async function retryUntil(check: () => Promise<void>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await check()
      return
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}

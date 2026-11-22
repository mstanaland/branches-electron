import type { FetchResult } from './git'

/** Two minutes: often enough to notice an upstream merge, rare enough to be no load. */
export const FETCH_INTERVAL_MS = 2 * 60_000

/** Caps the backoff at 8× the interval, so an offline or unauthenticated remote stops asking. */
const MAX_BACKOFF_FACTOR = 8

export interface FetchSchedulerDeps {
  /** Whether the repository has a remote at all. Asked before each fetch; cheap and local. */
  hasRemote: (root: string) => Promise<boolean>
  /** Updates the remote-tracking refs. Rejecting is expected and handled. */
  fetch: (root: string) => Promise<FetchResult>
  /** Called after a fetch moved a ref, so the renderer can re-read branches and status. */
  onRefsChanged: (root: string) => void
  /**
   * Called after every fetch that worked, whether or not it moved a ref, so the **merged
   * branches** are looked up again: a pull request can merge without a ref here moving.
   */
  onFetched: (root: string) => void
  intervalMs?: number
}

export interface FetchScheduler {
  /** The repository the user is looking at, or null. Fetches it now, then on the interval. */
  setActiveRepository: (root: string | null) => void
  /** Whether the window has focus. A background app makes no network calls. */
  setFocused: (focused: boolean) => void
  /** Cancels pending ticks immediately and resolves when any in-flight tick finishes. */
  stop: () => Promise<void>
}

/**
 * Keeps the active repository's remote-tracking refs current, so ahead/behind counts notice
 * work pushed elsewhere. Nothing on the local filesystem changes when a PR is merged, so this
 * is the only way the app can know.
 *
 * Fetches only while the window is focused, never two at once, and each tick is chained after
 * the previous one finishes rather than run off a fixed timer. Failures are quiet — a background
 * fetch is a nicety, not something the user asked for — and back off so an offline or
 * credential-refusing remote isn't retried every interval.
 */
export function createFetchScheduler(deps: FetchSchedulerDeps): FetchScheduler {
  const intervalMs = deps.intervalMs ?? FETCH_INTERVAL_MS
  /** Repositories found to have no remote, so they are never fetched again this activation. */
  const remoteless = new Set<string>()

  let activeRoot: string | null = null
  let focused = false
  let inFlight: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let consecutiveFailures = 0
  let lastAttemptAt: number | null = null
  /** Bumped whenever the target changes, so an in-flight fetch's result is discarded. */
  let generation = 0

  function cancelTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function currentDelayMs(): number {
    // One failure still retries at the normal interval; it is repeated failure that backs off.
    return intervalMs * Math.min(2 ** Math.max(0, consecutiveFailures - 1), MAX_BACKOFF_FACTOR)
  }

  function scheduleNext(): void {
    cancelTimer()
    if (activeRoot === null || !focused || inFlight || remoteless.has(activeRoot)) return
    // Measured from the last attempt, so switching apps repeatedly doesn't fetch repeatedly.
    const wait =
      lastAttemptAt === null ? 0 : Math.max(0, lastAttemptAt + currentDelayMs() - Date.now())
    timer = setTimeout(() => {
      timer = null
      inFlight = tick().finally(() => {
        inFlight = null
        // Re-read the target in case a different repository became active during this tick.
        scheduleNext()
      })
    }, wait)
  }

  async function tick(): Promise<void> {
    const root = activeRoot
    if (root === null || !focused) return
    const mine = generation
    lastAttemptAt = Date.now()
    try {
      if (!(await hasRemoteNow(root))) return
      const { changed } = await deps.fetch(root)
      consecutiveFailures = 0
      // Even for a repository just left: the root travels with it, and the fetch did happen.
      deps.onFetched(root)
      if (changed && mine === generation) deps.onRefsChanged(root)
    } catch {
      // Offline, no credentials, a remote that is gone: all quiet, all backed off.
      consecutiveFailures += 1
    }
  }

  async function hasRemoteNow(root: string): Promise<boolean> {
    if (remoteless.has(root)) return false
    if (await deps.hasRemote(root)) return true
    remoteless.add(root)
    return false
  }

  return {
    setActiveRepository(root) {
      if (root === activeRoot) return
      activeRoot = root
      // Discards an in-flight fetch's result, which belongs to the repository just left.
      generation += 1
      consecutiveFailures = 0
      lastAttemptAt = null
      // A repository can gain a remote between visits, so ask again when it comes back.
      if (root !== null) remoteless.delete(root)
      scheduleNext()
    },
    setFocused(next) {
      if (next === focused) return
      focused = next
      if (focused) scheduleNext()
      else cancelTimer()
    },
    stop() {
      generation += 1
      activeRoot = null
      cancelTimer()
      return inFlight ?? Promise.resolve()
    }
  }
}

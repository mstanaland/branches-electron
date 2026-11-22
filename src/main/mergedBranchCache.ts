import type { MergedBranch } from '../shared/github'

export interface MergedBranchCacheDeps {
  /**
   * Looks up a repository's **merged branches**. Resolves null when GitHub couldn't be asked, so
   * the last good result stands. Rejecting is treated the same way.
   */
  find: (root: string) => Promise<MergedBranch[] | null>
  /** Called when a recompute changed `root`'s result, so the renderer can read it again. */
  onChanged: (root: string) => void
}

export interface MergedBranchCache {
  /** The last result for `root`, looked up first if there is none yet. Never rejects. */
  get: (root: string) => Promise<MergedBranch[]>
  /** The last result for `root` as it stands, or undefined before any. Never asks GitHub. */
  cached: (root: string) => readonly MergedBranch[] | undefined
  /** Looks `root` up again after a fetch, reporting a change. Never rejects. */
  recompute: (root: string) => Promise<void>
  /**
   * Drops a branch the user just deleted, at once and without asking GitHub, so the renderer's
   * next read no longer has it. Reports the change if it was there.
   */
  branchDeleted: (root: string, name: string) => void
  /** Drops everything kept for a repository the user removed from the list. */
  forget: (root: string) => void
}

/** Order-independent, so the same branches found in another order are the same result. */
function fingerprint(merged: readonly MergedBranch[]): string {
  return JSON.stringify(merged.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)))
}

/**
 * Keeps the last **merged branches** result per repository in main, so **Refresh** and a
 * renderer re-read never reach GitHub: only a first read, a fetch or a delete does.
 *
 * Lookups of one repository run one at a time, so a slow, older lookup can never overwrite a
 * newer one. A lookup that fails keeps the last good result rather than clearing the badges.
 */
export function createMergedBranchCache(deps: MergedBranchCacheDeps): MergedBranchCache {
  const results = new Map<string, MergedBranch[]>()
  /** The tail of each repository's chain of lookups. */
  const queues = new Map<string, Promise<void>>()
  /**
   * What happened to each repository while its lookup was in flight. That lookup may have read
   * a branch before it was deleted, so its answer is filtered rather than trusted, and it is
   * dropped altogether if the repository was removed meanwhile.
   */
  const inFlight = new Map<string, { deleted: Set<string>; forgotten: boolean }>()

  /** Runs `task` after every lookup of `root` already queued. */
  function enqueue(root: string, task: () => Promise<void>): Promise<void> {
    const run = (queues.get(root) ?? Promise.resolve()).then(task)
    queues.set(root, run)
    void run.finally(() => {
      if (queues.get(root) === run) queues.delete(root)
    })
    return run
  }

  /** Looks `root` up and stores a good answer. Resolves whether the stored result changed. */
  async function lookUp(root: string): Promise<boolean> {
    const meanwhile = { deleted: new Set<string>(), forgotten: false }
    inFlight.set(root, meanwhile)
    let found: MergedBranch[] | null
    try {
      found = await deps.find(root).catch(() => null)
    } finally {
      inFlight.delete(root)
    }
    if (found === null || meanwhile.forgotten) return false
    found = found.filter((branch) => !meanwhile.deleted.has(branch.name))
    const before = results.get(root)
    results.set(root, found)
    return fingerprint(before ?? []) !== fingerprint(found)
  }

  return {
    async get(root) {
      if (!results.has(root)) {
        // The caller reads the answer itself, so a first lookup tells nobody.
        await enqueue(root, async () => {
          if (!results.has(root)) await lookUp(root)
        })
      }
      return results.get(root) ?? []
    },
    cached: (root) => results.get(root),
    recompute(root) {
      return enqueue(root, async () => {
        if (await lookUp(root)) deps.onChanged(root)
      })
    },
    branchDeleted(root, name) {
      inFlight.get(root)?.deleted.add(name)
      const before = results.get(root)
      if (before === undefined || !before.some((branch) => branch.name === name)) return
      results.set(
        root,
        before.filter((branch) => branch.name !== name)
      )
      deps.onChanged(root)
    },
    forget(root) {
      const running = inFlight.get(root)
      if (running !== undefined) running.forgotten = true
      results.delete(root)
    }
  }
}

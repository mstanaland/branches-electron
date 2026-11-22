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
  /** Looks `root` up again, after a fetch or a delete. Never rejects. */
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
   * Branches deleted while a lookup was in flight, per repository. That lookup may have read the
   * branch before it went, so its answer is filtered rather than trusted.
   */
  const deletedDuringLookUp = new Map<string, Set<string>>()

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
    const deleted = new Set<string>()
    deletedDuringLookUp.set(root, deleted)
    let found: MergedBranch[] | null
    try {
      found = await deps.find(root).catch(() => null)
    } finally {
      deletedDuringLookUp.delete(root)
    }
    if (found === null) return false
    found = found.filter((branch) => !deleted.has(branch.name))
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
    recompute(root) {
      return enqueue(root, async () => {
        if (await lookUp(root)) deps.onChanged(root)
      })
    },
    branchDeleted(root, name) {
      deletedDuringLookUp.get(root)?.add(name)
      const before = results.get(root)
      if (before === undefined || !before.some((branch) => branch.name === name)) return
      results.set(
        root,
        before.filter((branch) => branch.name !== name)
      )
      deps.onChanged(root)
    },
    forget(root) {
      results.delete(root)
    }
  }
}

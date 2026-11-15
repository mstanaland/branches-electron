import { enqueueWrite } from './queue'
import { runGit } from './run'

/** True when the repository has at least one remote configured, so a fetch has somewhere to go. */
export async function hasRemote(root: string): Promise<boolean> {
  const { stdout } = await runGit(root, ['remote'])
  return stdout.trim() !== ''
}

export interface FetchResult {
  /** True when the fetch moved, added or pruned a remote-tracking ref. */
  changed: boolean
}

/**
 * Updates the remote-tracking refs with `git fetch --prune`, passing no refspec so the
 * remote's configured one decides what comes down.
 *
 * `changed` says whether anything actually moved, by comparing the remote-tracking refs
 * either side of the fetch. Git's own output isn't parsed: it is human-formatted, and
 * `--porcelain` is too new to rely on.
 *
 * A fetch moves refs and writes FETCH_HEAD, so it goes through the repository's write queue
 * like any other write — otherwise a background tick could take a ref lock a checkout the user
 * just asked for needs. The two ref snapshots are inside the queued work, so nothing else can
 * move a ref between them. The cost is that a user's write waits behind a fetch in flight.
 *
 * Throws a `GitError` like any other git call — a network that is down, a remote that is gone
 * and refused credentials all come back as `COMMAND_FAILED`. Callers running this in the
 * background are expected to swallow that.
 */
export async function fetchRemote(root: string): Promise<FetchResult> {
  return enqueueWrite(root, async () => {
    const before = await remoteRefs(root)
    await runGit(root, ['fetch', '--prune'])
    const after = await remoteRefs(root)
    return { changed: before !== after }
  })
}

/**
 * Every remote-tracking ref and the commit it points at, as one comparable string.
 * `for-each-ref` sorts by refname, so the same refs always produce the same string.
 */
async function remoteRefs(root: string): Promise<string> {
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)',
    'refs/remotes'
  ])
  return stdout
}

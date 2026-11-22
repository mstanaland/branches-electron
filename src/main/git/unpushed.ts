import { resolves } from './log'
import { runGit } from './run'

/**
 * The **unpushed commits** reachable from `ref`: full oids of the commits no remote-tracking
 * branch reaches, in no particular order.
 *
 * Judged against every remote-tracking branch rather than `ref`'s upstream, so a branch with
 * no upstream counts only the commits made since it left one that was pushed. A repository
 * with no remote-tracking branches at all — no remote, or one never fetched from — has
 * nothing to judge against, and gives an empty list rather than every commit.
 *
 * A ref that doesn't resolve, as in a repository with no commits, gives an empty list too.
 *
 * `pushedHeads` are commits known to have been pushed though no remote-tracking branch has
 * them any more: the head of the pull request that merged the branch, whose remote branch was
 * deleted after a squash or rebase merge. They and everything behind them are not unpushed.
 * Anything that isn't a full oid, or isn't here, is ignored.
 */
export async function listUnpushedCommits(
  root: string,
  ref: string,
  pushedHeads: readonly string[] = []
): Promise<string[]> {
  if (!(await hasRemoteTrackingBranch(root))) return []
  if (!(await resolves(root, ref))) return []
  const { stdout } = await runGit(root, [
    'rev-list',
    // A pushed head that isn't here excludes nothing, rather than failing. Applies only to the
    // revisions after it.
    '--ignore-missing',
    ref,
    '--not',
    '--remotes',
    ...pushedHeads.filter((head) => FULL_OID.test(head)),
    // Nothing after this can be read as a path, whatever the ref is called.
    '--'
  ])
  return stdout.split('\n').filter((line) => line !== '')
}

/** SHA-1 or SHA-256. */
const FULL_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

async function hasRemoteTrackingBranch(root: string): Promise<boolean> {
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--count=1',
    '--format=%(refname)',
    'refs/remotes/'
  ])
  return stdout.trim() !== ''
}

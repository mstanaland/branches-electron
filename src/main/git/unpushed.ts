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
 */
export async function listUnpushedCommits(root: string, ref: string): Promise<string[]> {
  if (!(await hasRemoteTrackingBranch(root))) return []
  if (!(await resolves(root, ref))) return []
  const { stdout } = await runGit(root, [
    'rev-list',
    ref,
    '--not',
    '--remotes',
    // Nothing after this can be read as a path, whatever the ref is called.
    '--'
  ])
  return stdout.split('\n').filter((line) => line !== '')
}

async function hasRemoteTrackingBranch(root: string): Promise<boolean> {
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--count=1',
    '--format=%(refname)',
    'refs/remotes/'
  ])
  return stdout.trim() !== ''
}

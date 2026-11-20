import type { BranchDeletion } from '../../shared/git'
import { parseTracking, readBranches } from './branches'
import { GitError } from './errors'
import { enqueueWrite } from './queue'
import { runGit } from './run'

/**
 * The local branches **Delete branch** never offers: the **current branch**, the **default
 * branch**, and any branch checked out in a work tree (the main one included).
 */
export async function undeletableBranches(root: string): Promise<Set<string>> {
  const [{ branches, defaultName }, worktrees] = await Promise.all([
    readBranches(root),
    runGit(root, ['worktree', 'list', '--porcelain', '-z'])
  ])
  const names = new Set<string>()
  if (defaultName !== null) names.add(defaultName)
  for (const branch of branches) if (branch.isCurrent) names.add(branch.name)
  // Each attribute of each work tree is its own NUL-terminated field.
  for (const field of worktrees.stdout.split('\0')) {
    if (field.startsWith('branch refs/heads/')) names.add(field.slice('branch refs/heads/'.length))
  }
  return names
}

/**
 * Deletes local branch `name`, but only while it is still at `oid` — the tip the Delete Branch
 * dialog counted **branch-only commits** against. If it has moved, nothing is deleted and this
 * fails with BRANCH_MOVED. Runs in the repository's write queue.
 *
 * Always `git branch -D`, never `-d`: the dialog has already judged the risk, by a better rule
 * than git's. Don't "fix" this by trying `-d` first — see ADR 0009.
 */
export function deleteBranch(root: string, name: string, oid: string): Promise<void> {
  const ref = `refs/heads/${name}`
  return enqueueWrite(root, async () => {
    const { stdout } = await runGit(root, ['rev-parse', '--verify', '--quiet', ref], {
      okExitCodes: [1]
    })
    if (stdout.trim() !== oid) {
      throw new GitError(
        'BRANCH_MOVED',
        'This branch has changed since you opened this. Close and try again.',
        { args: ['rev-parse', '--verify', '--quiet', ref] }
      )
    }
    await runGit(root, ['branch', '-D', '--', name])
  })
}

/**
 * What deleting local branch `name` would lose: its tip, its **branch-only commits** — reachable
 * from it and from no other local branch, remote-tracking branch or tag (HEAD, the stash and
 * reflogs don't count) — and its **upstream** when that is **gone**. See ADR 0009.
 */
export async function readBranchDeletion(root: string, name: string): Promise<BranchDeletion> {
  const ref = `refs/heads/${name}`
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--format=%(objectname)%00%(upstream:short)%00%(upstream:remotename)%00%(upstream:track)',
    ref
  ])
  const line = stdout.split('\n').find((candidate) => candidate !== '')
  if (line === undefined) {
    throw new GitError('COMMAND_FAILED', `There is no branch called “${name}”.`, {
      args: ['for-each-ref', ref]
    })
  }
  const [oid = '', upstream = '', remote = '', track = ''] = line.split('\0')
  const gone = upstream !== '' && parseTracking(track).upstreamGone

  // Counted from the oid just read, not the ref, so the count and `oid` always agree. The
  // `--exclude` drops only this branch from `--branches`: a branch name has no glob characters.
  const count = await runGit(root, [
    'rev-list',
    '--count',
    oid,
    '--not',
    `--exclude=${name}`,
    '--branches',
    '--remotes',
    '--tags'
  ])

  return {
    name,
    oid,
    branchOnlyCommits: Number(count.stdout.trim()),
    goneUpstream: gone ? { name: upstream, remote } : null
  }
}

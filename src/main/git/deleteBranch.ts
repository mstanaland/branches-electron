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

const MOVED_MESSAGE = 'This branch has changed since you opened this. Close and try again.'

function branchMovedError(args: readonly string[], cause?: GitError): GitError {
  return new GitError('BRANCH_MOVED', MOVED_MESSAGE, {
    args,
    exitCode: cause?.exitCode,
    stderr: cause?.stderr,
    stdout: cause?.stdout
  })
}

/**
 * Deletes local branch `name`, but only while it is still at `oid` — the tip the Delete Branch
 * dialog counted **branch-only commits** against. If it has moved, nothing is deleted and this
 * fails with BRANCH_MOVED. Runs in the repository's write queue.
 *
 * With `upstreamOid`, deletes the branch's **upstream** from its **remote** first, with a lease
 * on that oid — the one the dialog counted against — so an upstream someone has pushed to
 * since is not deleted (BRANCH_MOVED). Only an upstream the dialog may offer can be deleted
 * this way. If the remote delete fails for any reason, the local branch is kept too.
 *
 * Always `git branch -D`, never `-d`: the dialog has already judged the risk, by a better rule
 * than git's. Don't "fix" this by trying `-d` first — see ADR 0009.
 */
export function deleteBranch(
  root: string,
  name: string,
  oid: string,
  upstreamOid: string | null = null
): Promise<void> {
  const ref = `refs/heads/${name}`
  return enqueueWrite(root, async () => {
    const branch = await readBranchTip(root, name)
    if (branch === null || branch.oid !== oid) throw branchMovedError(['for-each-ref', ref])
    if (upstreamOid !== null) {
      // Gone, or pruned since the dialog read it: what the user was offered isn't there.
      const upstream = await deletableUpstreamRefs(root, branch.upstream)
      if (upstream === null) {
        throw branchMovedError(['for-each-ref', '--format=%(upstream)', ref])
      }
      await deleteUpstream(root, upstream, upstreamOid)
    }
    await runGit(root, ['branch', '-D', '--', name])
  })
}

/**
 * `git push --delete` of `upstream`, leased on `oid`. A lease the remote no longer matches is
 * BRANCH_MOVED; any other failure — offline, credentials refused, a protected branch — stays
 * COMMAND_FAILED with git's own words. A successful push removes the remote-tracking ref too.
 */
async function deleteUpstream(root: string, upstream: UpstreamRefs, oid: string): Promise<void> {
  const args = [
    'push',
    '--no-follow-tags',
    `--force-with-lease=${upstream.remoteRef}:${oid}`,
    upstream.remote,
    `:${upstream.remoteRef}`
  ]
  try {
    await runGit(root, args)
  } catch (error) {
    if (error instanceof GitError && error.code === 'COMMAND_FAILED' && isStale(error.stderr)) {
      throw branchMovedError(args, error)
    }
    throw error
  }
}

/**
 * Another exception to "don't parse human-formatted output", as in push.ts: git reports a
 * broken lease only as text, and runGit pins LC_ALL=C so the wording is stable.
 */
function isStale(stderr: string): boolean {
  return /! \[rejected\] .*\(stale info\)/.test(stderr)
}

/** A branch's **upstream** as main needs it to delete it: where it is, on both sides. */
interface UpstreamRefs {
  /** Short name, e.g. `origin/bar`. */
  name: string
  remote: string
  /** The remote-tracking ref, e.g. `refs/remotes/origin/bar`. */
  trackingRef: string
  /** The branch's ref on the remote, e.g. `refs/heads/bar`. */
  remoteRef: string
  /** Where the remote-tracking ref points now. */
  oid: string
}

/** One local branch's tip and upstream, from `for-each-ref`; null if there's no branch. */
async function readBranchTip(
  root: string,
  name: string
): Promise<{
  oid: string
  goneUpstream: BranchDeletion['goneUpstream']
  upstream: UpstreamRefs | null
} | null> {
  const ref = `refs/heads/${name}`
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--format=%(objectname)%00%(upstream:short)%00%(upstream:remotename)%00%(upstream:track)%00%(upstream)%00%(upstream:remoteref)',
    ref
  ])
  const line = stdout.split('\n').find((candidate) => candidate !== '')
  if (line === undefined) return null
  const [oid = '', short = '', remote = '', track = '', trackingRef = '', remoteRef = ''] =
    line.split('\0')
  const none = { oid, goneUpstream: null, upstream: null }
  if (short === '') return none
  if (parseTracking(track).upstreamGone) return { ...none, goneUpstream: { name: short, remote } }
  // An upstream that is another local branch (remote ".") is not on a remote.
  if (remote === '' || remote === '.' || !trackingRef.startsWith('refs/remotes/')) return none
  const tip = await runGit(root, ['rev-parse', '--verify', '--quiet', trackingRef], {
    okExitCodes: [1]
  })
  const upstreamOid = tip.stdout.trim()
  if (upstreamOid === '') return none
  return {
    oid,
    goneUpstream: null,
    upstream: { name: short, remote, trackingRef, remoteRef, oid: upstreamOid }
  }
}

/**
 * The upstream **Delete branch** may offer to delete: `upstream`, unless it is the branch the
 * remote's HEAD points at: the remote's trunk, never offered for deletion.
 */
async function deletableUpstreamRefs(
  root: string,
  upstream: UpstreamRefs | null
): Promise<UpstreamRefs | null> {
  if (upstream === null) return null
  const { stdout } = await runGit(
    root,
    ['symbolic-ref', '--quiet', `refs/remotes/${upstream.remote}/HEAD`],
    { okExitCodes: [1] }
  )
  return stdout.trim() === upstream.trackingRef ? null : upstream
}

/**
 * What deleting local branch `name` would lose: its tip, its **branch-only commits** — reachable
 * from it and from no other local branch, remote-tracking branch or tag (HEAD, the stash and
 * reflogs don't count) — and its **upstream** when that is **gone**. When the upstream could be
 * deleted too, it comes with a second count: without the upstream as somewhere else, and with
 * the commits only the upstream has. See ADR 0009.
 */
export async function readBranchDeletion(root: string, name: string): Promise<BranchDeletion> {
  const branch = await readBranchTip(root, name)
  if (branch === null) {
    throw new GitError('COMMAND_FAILED', `There is no branch called “${name}”.`, {
      args: ['for-each-ref', `refs/heads/${name}`]
    })
  }
  const { oid, goneUpstream } = branch
  const upstream = await deletableUpstreamRefs(root, branch.upstream)

  // Counted from the oids just read, not the refs, so the counts and oids always agree. Each
  // `--exclude` drops one ref from the `--branches` or `--remotes` after it: ref names have no
  // glob characters.
  const [count, countWithUpstream] = await Promise.all([
    countCommits(root, [oid], [`--exclude=${name}`, '--branches', '--remotes', '--tags']),
    upstream === null
      ? null
      : countCommits(
          root,
          [oid, upstream.oid],
          [
            `--exclude=${name}`,
            '--branches',
            `--exclude=${upstream.trackingRef.slice('refs/remotes/'.length)}`,
            '--remotes',
            '--tags'
          ]
        )
  ])

  return {
    name,
    oid,
    branchOnlyCommits: count,
    goneUpstream,
    deletableUpstream:
      upstream === null || countWithUpstream === null
        ? null
        : {
            name: upstream.name,
            remote: upstream.remote,
            oid: upstream.oid,
            branchOnlyCommits: countWithUpstream
          }
  }
}

/** How many commits are reachable from `tips` and not from the refs `exclusions` select. */
async function countCommits(
  root: string,
  tips: readonly string[],
  exclusions: readonly string[]
): Promise<number> {
  const { stdout } = await runGit(root, ['rev-list', '--count', ...tips, '--not', ...exclusions])
  return Number(stdout.trim())
}

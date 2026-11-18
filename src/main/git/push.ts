import { GitError } from './errors'
import { readUpstream, requireCurrentBranch } from './head'
import { enqueueWrite } from './queue'
import { runGit } from './run'

/**
 * **Push**: sends the **current branch** to its **upstream**, in the repository's write queue.
 *
 * The destination is named explicitly — `git push <remote> refs/heads/<branch>:<upstream ref>`
 * — so a branch tracking an upstream of a different name pushes there, where
 * `push.default=simple` would refuse. The branch only: `--no-follow-tags` overrides a user's
 * `push.followTags`. Never forced: the refspec carries no `+`.
 *
 * **Detached HEAD**, no upstream and an upstream **gone** are settled from local refs before
 * anything reaches the network, as Pull does.
 */
export function pushBranch(root: string): Promise<void> {
  const args = ['push']
  return enqueueWrite(root, async () => {
    const branch = await requireCurrentBranch(root, 'push', args)
    // No upstream and a gone one get the same answer: the user's next move is Publish.
    const upstream = await readUpstream(root, branch)
    if (upstream === null || upstream.gone) {
      throw new GitError('NO_UPSTREAM', `${branch} has no upstream branch to push to.`, { args })
    }
    // A rejection means the remote has commits the branch lacks, so the only question is
    // whether the branch also has commits the remote lacks. If it is ahead at all, the two
    // have **diverged** and Pull — fast-forward only — can't join them; if not, it is only
    // **behind**, and pulling first is the fix.
    const rejected =
      upstream.ahead > 0
        ? `${branch} has diverged from its upstream: each has commits the other lacks, and Pull can’t fast-forward it.`
        : `${branch} is behind its upstream. Pull first, then push.`
    await runPush(
      root,
      ['push', '--no-follow-tags', upstream.remote, `refs/heads/${branch}:${upstream.ref}`],
      rejected
    )
  })
}

/**
 * **Publish branch**: creates the **current branch** on `remote` under the same name and
 * makes it the branch's **upstream**, with `git push --set-upstream`. For a branch with no
 * upstream, or one that is **gone**.
 *
 * `remote` must be one the repository has; the caller checks that, since it comes off IPC.
 * The remote may already have a branch of that name: if this one fast-forwards it, the push
 * just lands; if not, it fails as PUSH_REJECTED and never forces. That message doesn't point
 * at Pull, as Push's does: a branch being published has no upstream to pull from.
 */
export function publishBranch(root: string, remote: string): Promise<void> {
  const args = ['push', '--set-upstream']
  return enqueueWrite(root, async () => {
    const branch = await requireCurrentBranch(root, 'publish', args)
    const ref = `refs/heads/${branch}`
    await runPush(
      root,
      [...args, '--no-follow-tags', remote, `${ref}:${ref}`],
      `${remote} already has a ${branch} with commits this one doesn’t. Publishing won’t overwrite it.`
    )
  })
}

/**
 * Runs a push, turning git's refusal of a non-fast-forward into PUSH_REJECTED with the
 * caller's `rejected` message, which says what to do next.
 */
async function runPush(root: string, args: readonly string[], rejected: string): Promise<void> {
  try {
    await runGit(root, args)
  } catch (error) {
    if (
      !(error instanceof GitError) ||
      error.code !== 'COMMAND_FAILED' ||
      !isNonFastForward(error.stderr)
    ) {
      throw error
    }
    throw new GitError('PUSH_REJECTED', rejected, {
      args: error.args,
      exitCode: error.exitCode,
      stderr: error.stderr,
      stdout: error.stdout
    })
  }
}

/**
 * An exception to "don't parse human-formatted output", as in Pull: git reports a refused
 * non-fast-forward only as text, and runGit pins LC_ALL=C so the wording is stable. `fetch
 * first` is the same refusal when the remote has commits this repository has never seen.
 * A `[remote rejected]` — a hook or a protected branch — is not this, and stays
 * COMMAND_FAILED with git's own words.
 */
function isNonFastForward(stderr: string): boolean {
  return /! \[rejected\] .*\((non-fast-forward|fetch first)\)/.test(stderr)
}

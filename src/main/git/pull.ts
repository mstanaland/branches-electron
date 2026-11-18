import { GitError } from './errors'
import { requireCurrentBranch } from './head'
import { enqueueWrite } from './queue'
import { runGit } from './run'

/**
 * **Pull**: brings the **current branch** up to date with its **upstream** using
 * `git pull --ff-only`, in the repository's write queue like any other write.
 *
 * Fast-forward only, deliberately. A branch that has diverged fails with
 * PULL_NOT_FAST_FORWARD rather than being merged or rebased: both leave work behind that
 * the app has no surface for yet — a merge commit nobody asked for, or a repository stopped
 * mid-rebase. Merging and rebasing are their own tickets.
 *
 * A dirty work tree is git's business, not this function's: there is no pre-flight status
 * check, exactly as on the command line. Git itself aborts, work tree untouched, only when
 * the incoming commits would overwrite a file that has local changes — and that comes back
 * as COMMAND_FAILED carrying git's own wording. A dirty file the incoming commits don't
 * touch is no obstacle and the pull succeeds.
 *
 * **Detached HEAD** and a missing **upstream** are settled from local refs before anything
 * reaches the network, so they fail fast and with their own codes instead of as git's
 * "Please specify which branch you want to merge with".
 */
export function pullFastForward(root: string): Promise<void> {
  return enqueueWrite(root, async () => {
    const branch = await requireCurrentBranch(root, 'pull', ['pull', '--ff-only'])
    if (!(await hasUpstream(root))) {
      // One message for two states, because it is true of both and the user's next move is
      // the same: either no upstream was ever configured, or one was and the remote no
      // longer has it — an upstream **gone**, which a prune leaves behind.
      throw new GitError('NO_UPSTREAM', `${branch} has no upstream branch to pull from.`, {
        args: ['pull', '--ff-only']
      })
    }

    try {
      await runGit(root, ['pull', '--ff-only'])
    } catch (error) {
      if (error instanceof GitError && error.code === 'COMMAND_FAILED' && diverged(error.stderr)) {
        throw new GitError(
          'PULL_NOT_FAST_FORWARD',
          `${branch} has diverged from its upstream, so it can’t be fast-forwarded.`,
          {
            args: error.args,
            exitCode: error.exitCode,
            stderr: error.stderr
          }
        )
      }
      throw error
    }
  })
}

/**
 * Whether the current branch has an **upstream** configured. `@{upstream}` needs no branch
 * argument: it reads HEAD's own, which the caller has already established is a branch.
 */
async function hasUpstream(root: string): Promise<boolean> {
  // --quiet exits 1, not 128, for both states that matter here: no upstream configured and
  // an upstream configured but gone. Anything else is a real failure and should still throw.
  const { stdout } = await runGit(root, ['rev-parse', '--verify', '--quiet', '@{upstream}'], {
    okExitCodes: [1]
  })
  return stdout.trim() !== ''
}

/**
 * An exception to "don't parse human-formatted output", as in `checkoutBranch`: git reports
 * a refused fast-forward only as text, and runGit pins LC_ALL=C so the wording is stable.
 */
function diverged(stderr: string): boolean {
  return /Not possible to fast-forward/.test(stderr)
}

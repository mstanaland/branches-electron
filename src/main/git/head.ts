import { parseTracking } from './branches'
import { GitError } from './errors'
import { runGit } from './run'

/** The **current branch**, or null when HEAD is detached — which is what makes the ref fail. */
export async function currentBranch(root: string): Promise<string | null> {
  const { stdout } = await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    okExitCodes: [1]
  })
  const name = stdout.trim()
  return name === '' ? null : name
}

/**
 * The **current branch**, or a DETACHED_HEAD failure saying there is nothing to `verb` —
 * the guard every operation on the current branch starts with. `args` is the command the
 * failure is reported against.
 */
export async function requireCurrentBranch(
  root: string,
  verb: string,
  args: readonly string[]
): Promise<string> {
  const branch = await currentBranch(root)
  if (branch === null) {
    throw new GitError(
      'DETACHED_HEAD',
      `HEAD is not on a branch, so there is nothing to ${verb}.`,
      {
        args
      }
    )
  }
  return branch
}

/** A local branch's configured **upstream**, as `for-each-ref` reports it. */
export interface Upstream {
  /** The remote's name, e.g. `origin`. */
  remote: string
  /** The branch's full ref on the remote, e.g. `refs/heads/main`. */
  ref: string
  /** How many commits the branch has that its upstream lacks, as of the last fetch. */
  ahead: number
  /** True when the upstream is configured but no longer exists — **gone**. */
  gone: boolean
}

/** `branch`'s configured **upstream**, gone or not, or null when it has none. */
export async function readUpstream(root: string, branch: string): Promise<Upstream | null> {
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--format=%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream:track)',
    `refs/heads/${branch}`
  ])
  const [remote = '', ref = '', track = ''] = stdout.replace(/\n$/, '').split('\0')
  if (remote === '' || ref === '') return null
  const { ahead, upstreamGone } = parseTracking(track)
  return { remote, ref, ahead, gone: upstreamGone }
}

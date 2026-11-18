import type { PublishRemote, PublishTarget } from '../../shared/git'
import { currentBranch, readUpstream } from './head'
import { runGit } from './run'

/**
 * Where the **current branch** can be pushed or published: the branch, every **remote** with
 * its push URL and whether it already has the branch, and the remote a **gone** upstream was
 * on. All from local refs and config — nothing reaches the network.
 */
export async function getPublishTarget(root: string): Promise<PublishTarget> {
  const [branch, names] = await Promise.all([currentBranch(root), remoteNames(root)])
  const [urls, present, goneFrom] = await Promise.all([
    Promise.all(names.map((name) => pushUrl(root, name))),
    branch === null ? new Set<string>() : remoteBranchRefs(root, names, branch),
    branch === null ? null : goneUpstreamRemote(root, branch)
  ])
  const remotes: PublishRemote[] = names.map((name, index) => ({
    name,
    url: urls[index],
    hasBranch: present.has(`refs/remotes/${name}/${branch}`)
  }))
  return { branch, remotes, goneFrom }
}

/** Every remote's name, sorted. Remote names can't contain a newline, so lines will do. */
async function remoteNames(root: string): Promise<string[]> {
  const { stdout } = await runGit(root, ['remote'])
  return stdout
    .split('\n')
    .filter((name) => name !== '')
    .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Where a push to `remote` goes: its push URL, with `insteadOf` rewrites applied. */
async function pushUrl(root: string, remote: string): Promise<string | null> {
  // Exit 2 is git's "no URL configured" for a remote that exists.
  const { stdout } = await runGit(root, ['remote', 'get-url', '--push', remote], {
    okExitCodes: [2]
  })
  const url = stdout.trim()
  return url === '' ? null : url
}

/** Which of `refs/remotes/<remote>/<branch>` exist, across every remote. */
async function remoteBranchRefs(
  root: string,
  remotes: readonly string[],
  branch: string
): Promise<Set<string>> {
  if (remotes.length === 0) return new Set()
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--format=%(refname)',
    ...remotes.map((remote) => `refs/remotes/${remote}/${branch}`)
  ])
  return new Set(stdout.split('\n').filter((ref) => ref !== ''))
}

/** The remote `branch`'s upstream was on, when that upstream is gone; else null. */
async function goneUpstreamRemote(root: string, branch: string): Promise<string | null> {
  const upstream = await readUpstream(root, branch)
  return upstream?.gone === true ? upstream.remote : null
}

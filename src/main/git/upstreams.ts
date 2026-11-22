import { readBranches } from './branches'
import { runGit } from './run'

/** A local branch with an **upstream** setting, gone or not, and where that upstream lives. */
export interface BranchUpstream {
  /** The local branch's name. */
  name: string
  /** Full oid of the branch's tip. */
  tip: string
  /** The **remote** the upstream is on, e.g. "origin". */
  remote: string
  /** The remote's fetch URL, after `insteadOf` rewriting, or null if it has none. */
  remoteUrl: string | null
  /** The upstream's branch name on the remote, e.g. "feature/foo" — not the local name. */
  upstreamBranch: string
}

const FIELDS = [
  '%(refname:lstrip=2)',
  '%(objectname)',
  '%(upstream:remotename)',
  '%(upstream:remoteref)'
]

/**
 * Each local branch whose upstream is a branch on a remote, read from config — so a **gone**
 * upstream counts as much as one still there — and the **default branch**'s name.
 * A branch with no upstream, or one tracking a local branch (remote "."), is left out.
 */
export async function readBranchUpstreams(
  root: string
): Promise<{ upstreams: BranchUpstream[]; defaultName: string | null }> {
  const [refs, { defaultName }] = await Promise.all([
    runGit(root, ['for-each-ref', `--format=${FIELDS.join('%00')}`, 'refs/heads']),
    readBranches(root)
  ])
  const tracked: Array<Omit<BranchUpstream, 'remoteUrl'>> = []
  for (const line of refs.stdout.split('\n')) {
    const fields = line.split('\0')
    if (fields.length !== FIELDS.length) continue
    const [name, tip, remote, remoteRef] = fields
    if (remote === '' || remote === '.' || !remoteRef.startsWith('refs/heads/')) continue
    tracked.push({ name, tip, remote, upstreamBranch: remoteRef.slice('refs/heads/'.length) })
  }
  const remotes = [...new Set(tracked.map((branch) => branch.remote))]
  const urls = new Map(
    await Promise.all(
      remotes.map(async (remote) => [remote, await remoteUrl(root, remote)] as const)
    )
  )
  return {
    upstreams: tracked.map((branch) => ({ ...branch, remoteUrl: urls.get(branch.remote) ?? null })),
    defaultName
  }
}

/** A remote's URL as git would fetch from it, or null when it has none or doesn't exist. */
async function remoteUrl(root: string, remote: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(root, ['remote', 'get-url', '--', remote])
    return stdout.trim() || null
  } catch {
    return null
  }
}

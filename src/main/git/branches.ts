import type { Branch } from '../../shared/git'
import { runGit } from './run'

const FIELDS = [
  '%(refname:short)',
  '%(objectname:short)',
  '%(HEAD)',
  '%(upstream:short)',
  '%(upstream:track)'
]

/** Local branches, with the default branch first and the rest in natural order. */
export async function listBranches(root: string): Promise<Branch[]> {
  const { branches, defaultName } = await readBranches(root)
  return sortBranches(branches, defaultName)
}

/** Local branches, unsorted, and the **default branch**'s name (null when there is none). */
export async function readBranches(
  root: string
): Promise<{ branches: Branch[]; defaultName: string | null }> {
  const [refs, originHead] = await Promise.all([
    runGit(root, ['for-each-ref', `--format=${FIELDS.join('%00')}`, 'refs/heads']),
    originHeadBranch(root)
  ])
  const branches = parseBranches(refs.stdout)
  return { branches, defaultName: defaultBranchName(originHead, branches) }
}

/** Parses `for-each-ref` output: one branch per line, fields separated by NUL. */
export function parseBranches(output: string): Branch[] {
  const branches: Branch[] = []
  for (const line of output.split('\n')) {
    const fields = line.split('\0')
    if (fields.length !== FIELDS.length) continue
    const [name, shortOid, head, upstream, track] = fields
    branches.push({
      name,
      shortOid,
      isCurrent: head === '*',
      upstream: upstream || null,
      ...parseTracking(track)
    })
  }
  return branches
}

/** Parses `%(upstream:track)`, e.g. "[ahead 1, behind 2]", "[gone]" or "". */
export function parseTracking(track: string): Pick<Branch, 'ahead' | 'behind' | 'upstreamGone'> {
  const result = { ahead: 0, behind: 0, upstreamGone: false }
  const inner = track.match(/^\[(.*)\]$/)?.[1]
  if (!inner) return result
  for (const part of inner.split(',').map((p) => p.trim())) {
    if (part === 'gone') result.upstreamGone = true
    else if (part.startsWith('ahead ')) result.ahead = Number(part.slice(6))
    else if (part.startsWith('behind ')) result.behind = Number(part.slice(7))
  }
  return result
}

const COMMON_DEFAULT_NAMES = ['main', 'master', 'develop', 'dev', 'trunk']

/**
 * The default branch: whatever origin/HEAD points to if that branch exists
 * locally, otherwise the first common default name that exists.
 */
export function defaultBranchName(originHead: string | null, branches: Branch[]): string | null {
  const names = new Set(branches.map((b) => b.name))
  if (originHead && names.has(originHead)) return originHead
  return COMMON_DEFAULT_NAMES.find((name) => names.has(name)) ?? null
}

export function sortBranches(branches: Branch[], defaultName: string | null): Branch[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return branches.toSorted((a, b) => {
    if (a.name === defaultName) return -1
    if (b.name === defaultName) return 1
    return collator.compare(a.name, b.name)
  })
}

/** The branch origin/HEAD points to (e.g. "main"), or null if it isn't recorded. */
async function originHeadBranch(root: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    // "origin/feature/x" -> "feature/x": drop only the remote name.
    const ref = stdout.trim()
    const slash = ref.indexOf('/')
    return slash === -1 ? null : ref.slice(slash + 1)
  } catch {
    return null
  }
}

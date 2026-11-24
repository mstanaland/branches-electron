import { readBranches } from './branches'
import { GitError } from './errors'
import type { Commit, DefaultBranchBase } from '../../shared/git'
import { shortOid } from '../../shared/oid'
import { runGit } from './run'

/**
 * The fields of one commit, in order. `-z` makes git separate commits with NUL too, so the
 * whole of stdout is one flat run of NUL-separated fields: no field can contain a NUL, so
 * taking them in groups of this many is unambiguous.
 */
const FIELDS = ['%H', '%P', '%an', '%aI', '%s']

/**
 * Commits reachable from `ref`, newest first.
 *
 * `--topo-order` rather than git's default date order: it keeps a line of work contiguous
 * instead of interleaving branches by timestamp, which is what makes the lanes readable (and
 * what stops a clock-skewed commit from reordering the graph).
 *
 * A ref that doesn't resolve gives an empty list rather than an error, because the case that
 * matters — a repository with no commits at all, where `HEAD` points at an unborn branch —
 * is a normal state to be looking at, not a failure.
 */
export async function listCommits(
  root: string,
  ref: string,
  limit: number,
  skip: number
): Promise<Commit[]> {
  if (!(await resolves(root, ref))) return []
  const { stdout } = await runGit(root, [
    'log',
    '--topo-order',
    `--format=${FIELDS.join('%x00')}`,
    '-z',
    `--max-count=${limit}`,
    `--skip=${skip}`,
    ref,
    // Nothing after this can be read as a path, whatever the ref is called.
    '--'
  ])
  return parseCommits(stdout)
}

/** Whether `ref` names a commit. False in a repository with no commits. */
export async function resolves(root: string, ref: string): Promise<boolean> {
  try {
    // `^{commit}` so a tag or a tree can't come back as something the log can't walk.
    await runGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

/** Parses the NUL-separated field run from `listCommits`. */
export function parseCommits(output: string): Commit[] {
  const fields = output.split('\0')
  const commits: Commit[] = []
  // A trailing separator leaves a short group on the end, which is dropped rather than
  // parsed into a commit with empty fields.
  for (let i = 0; i + FIELDS.length <= fields.length; i += FIELDS.length) {
    const [oid, parents, authorName, authorDate, subject] = fields.slice(i, i + FIELDS.length)
    commits.push({
      oid,
      shortOid: shortOid(oid),
      // `%P` is space-separated, and empty for a root commit.
      parents: parents.length === 0 ? [] : parents.split(' '),
      subject,
      authorName,
      authorDate
    })
  }
  return commits
}

/**
 * Whether `descendant` contains `ancestor` — true when they are the same commit. False when
 * either isn't a commit in this repository, as for a commit never fetched.
 */
export async function isAncestor(
  root: string,
  ancestor: string,
  descendant: string
): Promise<boolean> {
  if (!(await resolves(root, ancestor)) || !(await resolves(root, descendant))) return false
  try {
    await runGit(root, ['merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch (error) {
    // Exit 1 is git's "no"; anything else is a real failure.
    if (error instanceof GitError && error.exitCode === 1) return false
    throw error
  }
}

/**
 * The newest commit of `ref`'s history that the **default branch** has — its tip when `ref`
 * contains it, as after merging it in, otherwise where `ref` forked from it — and whether the
 * default branch has moved on past it. This is where the default branch's line starts in
 * `ref`'s graph. Null when there is no default branch, when either side resolves to nothing,
 * or when the two share no history.
 */
export async function findDefaultBranchBase(
  root: string,
  ref: string
): Promise<DefaultBranchBase | null> {
  const { defaultName } = await readBranches(root)
  if (defaultName === null) return null
  const defaultRef = `refs/heads/${defaultName}`
  if (!(await resolves(root, defaultRef)) || !(await resolves(root, ref))) return null
  try {
    const [base, tip] = await Promise.all([
      runGit(root, ['merge-base', defaultRef, ref]),
      runGit(root, ['rev-parse', '--verify', `${defaultRef}^{commit}`])
    ])
    const oid = base.stdout.trim()
    return { oid, movedOn: oid !== tip.stdout.trim() }
  } catch (error) {
    // Exit 1 is git's "no common ancestor"; anything else is a real failure.
    if (error instanceof GitError && error.exitCode === 1) return null
    throw error
  }
}

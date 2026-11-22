import type { MergedBranch } from '../../shared/github'
import { isAncestor } from '../git/log'
import { readBranchUpstreams, type BranchUpstream } from '../git/upstreams'
import type { MergedPullRequest, MergedPullRequests } from './query'
import { parseGitHubRemote, type GitHubRepository } from './remote'

/**
 * GitHub, as the finder sees it: given a repository and head branch names, its default branch
 * and each name's merged pull requests. Rejecting is expected and handled.
 */
export type LookUpMergedPullRequests = (
  repository: GitHubRepository,
  headNames: readonly string[]
) => Promise<MergedPullRequests>

/**
 * The **merged branches** of the repository at `root`, each with the **pull request** that
 * merged it (ADR-0011).
 *
 * A branch is merged only when a merged pull request on the GitHub repository of its upstream's
 * remote has the upstream's branch name as its head, GitHub's default branch as its base, and
 * a head commit that is the branch's tip or — when that commit is here to check — contains it.
 * Nothing else counts: not git's reachability, not a gone upstream. The newest matching pull
 * request wins. The default branch, branches with no upstream and branches on remotes that
 * aren't GitHub repositories are never returned.
 *
 * GitHub is asked once per repository. When asking fails — no `gh`, logged out, offline, an
 * answer that makes no sense — that repository's branches are simply not merged: this never
 * rejects for GitHub's sake, because the feature is silent.
 */
export async function findMergedBranches(
  root: string,
  lookUp: LookUpMergedPullRequests
): Promise<MergedBranch[]> {
  const { upstreams, defaultName } = await readBranchUpstreams(root)

  const byRepository = new Map<
    string,
    { repository: GitHubRepository; branches: BranchUpstream[] }
  >()
  for (const branch of upstreams) {
    if (branch.name === defaultName || branch.remoteUrl === null) continue
    const repository = parseGitHubRemote(branch.remoteUrl)
    if (repository === null) continue
    const key = `${repository.host}/${repository.owner}/${repository.name}`.toLowerCase()
    const group = byRepository.get(key) ?? { repository, branches: [] }
    group.branches.push(branch)
    byRepository.set(key, group)
  }

  const found = await Promise.all(
    [...byRepository.values()].map(({ repository, branches }) =>
      mergedInRepository(root, repository, branches, lookUp)
    )
  )
  return found.flat()
}

/**
 * As `findMergedBranches`, but resolves null when asking GitHub failed for any of the
 * repository's GitHub remotes, so a caller holding an earlier answer can keep it rather than
 * mistake an outage for "nothing is merged".
 */
export async function findMergedBranchesOrNull(
  root: string,
  lookUp: LookUpMergedPullRequests
): Promise<MergedBranch[] | null> {
  let failed = false
  const merged = await findMergedBranches(root, async (repository, headNames) => {
    try {
      return await lookUp(repository, headNames)
    } catch (error) {
      failed = true
      throw error
    }
  })
  return failed ? null : merged
}

async function mergedInRepository(
  root: string,
  repository: GitHubRepository,
  branches: BranchUpstream[],
  lookUp: LookUpMergedPullRequests
): Promise<MergedBranch[]> {
  const headNames = [...new Set(branches.map((branch) => branch.upstreamBranch))]
  let answer: MergedPullRequests
  try {
    answer = await lookUp(repository, headNames)
  } catch {
    return []
  }
  const { defaultBranch } = answer
  if (defaultBranch === null) return []

  const merged = await Promise.all(
    branches.map(async (branch): Promise<MergedBranch | null> => {
      // A branch tracking the default branch itself is the trunk under another name.
      if (branch.upstreamBranch === defaultBranch) return null
      const candidates = (answer.byHead.get(branch.upstreamBranch) ?? [])
        .filter((pr) => pr.baseBranch === defaultBranch)
        .toSorted((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
      for (const pr of candidates) {
        if (await carriesTip(root, branch.tip, pr)) {
          return { name: branch.name, pullRequest: pr }
        }
      }
      return null
    })
  )
  return merged.filter((branch) => branch !== null)
}

/**
 * Whether the pull request carried everything on the branch: its head is the tip, or contains
 * it — a teammate's review fix the branch never pulled. Only provable when the head is here.
 */
async function carriesTip(root: string, tip: string, pr: MergedPullRequest): Promise<boolean> {
  if (pr.headOid === tip) return true
  return isAncestor(root, tip, pr.headOid)
}

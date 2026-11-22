import { afterAll, describe, expect, it } from 'vitest'
import {
  addBareRemote,
  cleanupTestRepos,
  createRepoWithCommit,
  makeTempDir,
  testRepoAt,
  type TestRepo
} from '../git/test-repo'
import {
  findMergedBranches,
  findMergedBranchesOrNull,
  type LookUpMergedPullRequests
} from './mergedBranches'
import type { MergedPullRequest } from './query'
import type { GitHubRepository } from './remote'

afterAll(cleanupTestRepos)

const GITHUB_URL = 'https://github.com/octo/hello.git'

/**
 * A repository whose origin fetches from GitHub but pushes to a local bare repository, so the
 * test can push branches and set upstreams without the network, while every URL Branches reads
 * says github.com.
 */
async function createGitHubClone(): Promise<TestRepo> {
  const repo = await createRepoWithCommit()
  const bare = await addBareRemote(repo)
  await repo.git('config', 'remote.origin.pushurl', bare.root)
  await repo.git('remote', 'set-url', 'origin', GITHUB_URL)
  return repo
}

let commitCount = 0

/** Creates `name` from main with one commit, and pushes it as `upstream` (default: same name). */
async function pushedBranch(repo: TestRepo, name: string, upstream = name): Promise<string> {
  await repo.git('switch', '-q', '-c', name, 'main')
  await repo.write(`${name}.txt`, `${name} ${commitCount++}\n`)
  await repo.commit(`Work on ${name}`)
  await repo.git('push', '-q', '-u', 'origin', `${name}:${upstream}`)
  await repo.git('switch', '-q', 'main')
  return tip(repo, name)
}

async function tip(repo: TestRepo, ref: string): Promise<string> {
  return (await repo.git('rev-parse', ref)).trim()
}

let prNumber = 100

function pullRequest(
  headOid: string,
  overrides: Partial<MergedPullRequest> = {}
): MergedPullRequest {
  const number = prNumber++
  return {
    number,
    title: `Pull request ${number}`,
    url: `https://github.com/octo/hello/pull/${number}`,
    baseBranch: 'main',
    mergedAt: '2026-11-01T10:00:00Z',
    headOid,
    ...overrides
  }
}

/** A GitHub that knows these merged pull requests by head name, and records what it was asked. */
function fakeGitHub(
  byHead: Record<string, MergedPullRequest[]>,
  defaultBranch: string | null = 'main'
): LookUpMergedPullRequests & {
  calls: Array<{ repository: GitHubRepository; headNames: readonly string[] }>
} {
  const calls: Array<{ repository: GitHubRepository; headNames: readonly string[] }> = []
  const lookUp = async (repository: GitHubRepository, headNames: readonly string[]) => {
    calls.push({ repository, headNames })
    return {
      defaultBranch,
      byHead: new Map(headNames.map((headName) => [headName, byHead[headName] ?? []]))
    }
  }
  return Object.assign(lookUp, { calls })
}

/** A GitHub that can't be asked, as when `gh` is logged out. */
const notLoggedIn: LookUpMergedPullRequests = async () => {
  throw new Error('gh: not logged in')
}

describe('findMergedBranches', () => {
  it('finds a squash-merged branch, with its pull request', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    await repo.git('merge', '-q', '--squash', 'feature')
    await repo.commit('Feature (#100)')
    const pr = pullRequest(head)

    const merged = await findMergedBranches(repo.root, fakeGitHub({ feature: [pr] }))

    expect(merged).toEqual([
      {
        name: 'feature',
        pullRequest: {
          number: pr.number,
          title: pr.title,
          url: pr.url,
          baseBranch: 'main',
          mergedAt: pr.mergedAt
        }
      }
    ])
  })

  it('finds a rebase-merged branch, whose commits were rewritten onto main', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    await repo.write('other.txt')
    await repo.commit('Someone else’s work')
    await repo.git('cherry-pick', 'feature')

    const merged = await findMergedBranches(repo.root, fakeGitHub({ feature: [pullRequest(head)] }))

    expect(merged.map((branch) => branch.name)).toEqual(['feature'])
  })

  it('finds a branch merged with a merge commit', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    await repo.git('merge', '-q', '--no-ff', '-m', 'Merge pull request #1', 'feature')

    const merged = await findMergedBranches(repo.root, fakeGitHub({ feature: [pullRequest(head)] }))

    expect(merged.map((branch) => branch.name)).toEqual(['feature'])
  })

  it('matches on the upstream’s branch name, not the local one', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'foo', 'feature/foo')
    const github = fakeGitHub({ 'feature/foo': [pullRequest(head)], foo: [pullRequest(head)] })

    const merged = await findMergedBranches(repo.root, github)

    expect(merged.map((branch) => branch.name)).toEqual(['foo'])
    expect(github.calls[0].headNames).toEqual(['feature/foo'])
    expect(github.calls[0].repository).toEqual({ host: 'github.com', owner: 'octo', name: 'hello' })
  })

  it('finds a branch whose upstream is gone', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    await repo.git('update-ref', '-d', 'refs/remotes/origin/feature')

    const merged = await findMergedBranches(repo.root, fakeGitHub({ feature: [pullRequest(head)] }))

    expect(merged.map((branch) => branch.name)).toEqual(['feature'])
  })

  it('does not find a branch with commits made after its pull request merged', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    await repo.git('switch', '-q', 'feature')
    await repo.write('later.txt')
    await repo.commit('Work that never landed')
    await repo.git('switch', '-q', 'main')

    const merged = await findMergedBranches(repo.root, fakeGitHub({ feature: [pullRequest(head)] }))

    expect(merged).toEqual([])
  })

  it('finds a branch behind its pull request’s head, when that head was fetched', async () => {
    const repo = await createGitHubClone()
    await pushedBranch(repo, 'feature')
    // A review fix pushed from elsewhere: the remote-tracking ref has it, the branch doesn't.
    await repo.git('switch', '-q', 'feature')
    await repo.write('review.txt')
    await repo.commit('Review fix')
    await repo.git('push', '-q', 'origin', 'feature')
    const head = await tip(repo, 'feature')
    await repo.git('reset', '-q', '--hard', 'HEAD~1')
    await repo.git('switch', '-q', 'main')

    const merged = await findMergedBranches(repo.root, fakeGitHub({ feature: [pullRequest(head)] }))

    expect(merged.map((branch) => branch.name)).toEqual(['feature'])
  })

  it('does not find a branch behind a pull request head it has never seen', async () => {
    const repo = await createGitHubClone()
    await pushedBranch(repo, 'feature')
    const unseen = 'f'.repeat(40)

    const merged = await findMergedBranches(
      repo.root,
      fakeGitHub({ feature: [pullRequest(unseen)] })
    )

    expect(merged).toEqual([])
  })

  it('does not find a new branch that reuses the name of an old merged one', async () => {
    const repo = await createGitHubClone()
    const oldHead = await pushedBranch(repo, 'feature')
    await repo.git('merge', '-q', '--squash', 'feature')
    await repo.commit('Old feature (#1)')
    await repo.git('branch', '-q', '-D', 'feature')
    await repo.git('push', '-q', 'origin', '--delete', 'feature')
    await pushedBranch(repo, 'feature')

    const merged = await findMergedBranches(
      repo.root,
      fakeGitHub({ feature: [pullRequest(oldHead)] })
    )

    expect(merged).toEqual([])
  })

  it('does not find a branch merged into a branch other than the default branch', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')

    const merged = await findMergedBranches(
      repo.root,
      fakeGitHub({ feature: [pullRequest(head, { baseBranch: 'release' })] })
    )

    expect(merged).toEqual([])
  })

  it('judges the base against GitHub’s default branch', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')

    const merged = await findMergedBranches(
      repo.root,
      fakeGitHub({ feature: [pullRequest(head, { baseBranch: 'main' })] }, 'trunk')
    )

    expect(merged).toEqual([])
  })

  it('never asks about, or finds, a branch with no upstream', async () => {
    const repo = await createGitHubClone()
    await repo.git('switch', '-q', '-c', 'local-only')
    await repo.write('local.txt')
    await repo.commit('Never pushed')
    await repo.git('switch', '-q', 'main')
    const github = fakeGitHub({ 'local-only': [pullRequest(await tip(repo, 'local-only'))] })

    const merged = await findMergedBranches(repo.root, github)

    expect(merged).toEqual([])
    expect(github.calls.flatMap((call) => call.headNames)).not.toContain('local-only')
  })

  it('never asks about, or finds, a branch on a remote that isn’t on GitHub', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    const head = await pushedBranch(repo, 'feature')
    const github = fakeGitHub({ feature: [pullRequest(head)] })

    const merged = await findMergedBranches(repo.root, github)

    expect(merged).toEqual([])
    expect(github.calls).toEqual([])
  })

  it('never finds the default branch', async () => {
    const repo = await createGitHubClone()
    const github = fakeGitHub({ main: [pullRequest(await tip(repo, 'main'))] })

    const merged = await findMergedBranches(repo.root, github)

    expect(merged).toEqual([])
  })

  it('picks the most recently merged of several matching pull requests', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    const older = pullRequest(head, { mergedAt: '2026-10-01T10:00:00Z' })
    const newest = pullRequest(head, { mergedAt: '2026-11-15T10:00:00Z' })
    const middle = pullRequest(head, { mergedAt: '2026-11-01T10:00:00Z' })

    const merged = await findMergedBranches(
      repo.root,
      fakeGitHub({ feature: [older, newest, middle] })
    )

    expect(merged.map((branch) => branch.pullRequest.number)).toEqual([newest.number])
  })

  it('passes over a newer pull request that didn’t carry the tip for an older one that did', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    const carried = pullRequest(head, { mergedAt: '2026-10-01T10:00:00Z' })
    const other = pullRequest('e'.repeat(40), { mergedAt: '2026-11-15T10:00:00Z' })

    const merged = await findMergedBranches(repo.root, fakeGitHub({ feature: [other, carried] }))

    expect(merged.map((branch) => branch.pullRequest.number)).toEqual([carried.number])
  })

  it('finds nothing, and throws nothing, when GitHub can’t be asked', async () => {
    const repo = await createGitHubClone()
    await pushedBranch(repo, 'feature')

    await expect(findMergedBranches(repo.root, notLoggedIn)).resolves.toEqual([])
  })

  it('handles branch names with slashes and unusual characters', async () => {
    const repo = await createGitHubClone()
    const name = 'user/fix-#12_ü.x'
    const head = await pushedBranch(repo, name)

    const merged = await findMergedBranches(repo.root, fakeGitHub({ [name]: [pullRequest(head)] }))

    expect(merged.map((branch) => branch.name)).toEqual([name])
  })

  it('asks once per GitHub repository, however many branches track it', async () => {
    const repo = await createGitHubClone()
    const a = await pushedBranch(repo, 'a')
    const b = await pushedBranch(repo, 'b')
    const github = fakeGitHub({ a: [pullRequest(a)], b: [pullRequest(b)] })

    const merged = await findMergedBranches(repo.root, github)

    expect(merged.map((branch) => branch.name).toSorted()).toEqual(['a', 'b'])
    expect(github.calls).toHaveLength(1)
    expect([...github.calls[0].headNames].toSorted()).toEqual(['a', 'b'])
  })

  it('finds nothing in a repository with no commits', async () => {
    const root = await makeTempDir()
    const repo = testRepoAt(root)
    await repo.git('init', '-q', '-b', 'main')

    await expect(findMergedBranches(root, fakeGitHub({}))).resolves.toEqual([])
  })
})

describe('findMergedBranchesOrNull', () => {
  it('finds the same merged branches when GitHub answers', async () => {
    const repo = await createGitHubClone()
    const head = await pushedBranch(repo, 'feature')
    const pr = pullRequest(head)

    const merged = await findMergedBranchesOrNull(repo.root, fakeGitHub({ feature: [pr] }))

    expect(merged?.map((branch) => branch.name)).toEqual(['feature'])
  })

  it('finds an empty result, not null, when GitHub answers with nothing merged', async () => {
    const repo = await createGitHubClone()
    await pushedBranch(repo, 'feature')

    await expect(findMergedBranchesOrNull(repo.root, fakeGitHub({}))).resolves.toEqual([])
  })

  it('resolves null, rather than empty, when GitHub can’t be asked', async () => {
    const repo = await createGitHubClone()
    await pushedBranch(repo, 'feature')

    await expect(findMergedBranchesOrNull(repo.root, notLoggedIn)).resolves.toBeNull()
  })
})

import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Branch } from '../../shared/git'
import { defaultBranchName, listBranches, parseTracking } from './branches'
import { cleanupTestRepos, cloneRepo, createRepoWithCommit, makeTempDir } from './test-repo'

afterAll(cleanupTestRepos)

function makeBranch(name: string): Branch {
  return {
    name,
    isCurrent: false,
    shortOid: 'abc1234',
    upstream: null,
    upstreamGone: false,
    checkedOutElsewhere: false,
    ahead: 0,
    behind: 0
  }
}

describe('listBranches', () => {
  it('puts the default branch first and sorts the rest naturally', async () => {
    const repo = await createRepoWithCommit()
    for (const name of ['zeta', 'feature/b', 'alpha', 'feature/a', 'v10', 'v2']) {
      await repo.git('branch', name)
    }

    const names = (await listBranches(repo.root)).map((branch) => branch.name)
    expect(names).toEqual(['main', 'alpha', 'feature/a', 'feature/b', 'v2', 'v10', 'zeta'])
  })

  it('marks the current branch', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'work')

    const branches = await listBranches(repo.root)
    expect(branches.filter((branch) => branch.isCurrent).map((branch) => branch.name)).toEqual([
      'work'
    ])
  })

  it('marks a branch checked out in another work tree, and not the current branch', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'elsewhere')
    await repo.git('branch', 'free')
    const other = join(await makeTempDir(), 'other tree')
    await repo.git('worktree', 'add', '-q', other, 'elsewhere')

    const branches = await listBranches(repo.root)
    const flags = Object.fromEntries(branches.map((b) => [b.name, b.checkedOutElsewhere]))
    expect(flags).toEqual({ main: false, elsewhere: true, free: false })
  })

  it('marks the main work tree’s branch when read from a linked work tree', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'linked')
    const other = join(await makeTempDir(), 'linked')
    await repo.git('worktree', 'add', '-q', other, 'linked')

    const branches = await listBranches(other)
    const flags = Object.fromEntries(branches.map((b) => [b.name, b.checkedOutElsewhere]))
    expect(flags).toEqual({ main: true, linked: false })
  })

  it('uses origin/HEAD for the default branch, even when main exists', async () => {
    const origin = await createRepoWithCommit('trunk')
    const clone = await cloneRepo(origin)
    await clone.git('branch', 'main')

    const names = (await listBranches(clone.root)).map((branch) => branch.name)
    expect(names).toEqual(['trunk', 'main'])
  })

  it('reports upstream tracking, including a deleted upstream', async () => {
    const origin = await createRepoWithCommit()
    await origin.git('branch', 'feature')
    const clone = await cloneRepo(origin)
    await clone.git('checkout', '-q', 'feature') // creates a tracking branch
    await clone.write('local.txt')
    await clone.commit('Local')

    await origin.git('branch', '-D', 'feature')
    await clone.git('fetch', '-q', '--prune')

    const branches = await listBranches(clone.root)
    const main = branches.find((branch) => branch.name === 'main')
    const feature = branches.find((branch) => branch.name === 'feature')

    expect(main).toMatchObject({
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
      upstreamGone: false
    })
    expect(feature).toMatchObject({ upstream: 'origin/feature', upstreamGone: true })
    expect(feature?.shortOid).toMatch(/^[0-9a-f]{7,}$/)
  })
})

describe('parseTracking', () => {
  it.each([
    ['', { ahead: 0, behind: 0, upstreamGone: false }],
    ['[ahead 3]', { ahead: 3, behind: 0, upstreamGone: false }],
    ['[behind 2]', { ahead: 0, behind: 2, upstreamGone: false }],
    ['[ahead 1, behind 4]', { ahead: 1, behind: 4, upstreamGone: false }],
    ['[gone]', { ahead: 0, behind: 0, upstreamGone: true }]
  ])('parses %j', (track, expected) => {
    expect(parseTracking(track)).toEqual(expected)
  })
})

describe('defaultBranchName', () => {
  it('ignores origin/HEAD when that branch is not checked out locally', () => {
    expect(defaultBranchName('develop', [makeBranch('master'), makeBranch('x')])).toBe('master')
  })

  it('returns null when there is no recognizable default', () => {
    expect(defaultBranchName(null, [makeBranch('x'), makeBranch('y')])).toBeNull()
  })
})

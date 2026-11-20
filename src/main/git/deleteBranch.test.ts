import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { deleteBranch, readBranchDeletion, undeletableBranches } from './deleteBranch'
import { GitError } from './errors'
import {
  addBareRemote,
  cleanupTestRepos,
  cloneRepo,
  createRepo,
  createRepoWithCommit,
  makeTempDir,
  type TestRepo
} from './test-repo'

afterAll(cleanupTestRepos)

describe('readBranchDeletion', () => {
  it('counts no branch-only commits for a branch merged into another', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('checkout', '-q', 'main')
    await repo.git('merge', '-q', '--no-ff', '-m', 'Merge', 'feature')

    const deletion = await readBranchDeletion(repo.root, 'feature')

    expect(deletion).toEqual({
      name: 'feature',
      oid: (await repo.git('rev-parse', 'feature')).trim(),
      branchOnlyCommits: 0,
      goneUpstream: null,
      deletableUpstream: null
    })
  })

  it('counts the commits only the branch has', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.write('b.txt')
    await repo.commit('B')
    await repo.git('checkout', '-q', 'main')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      branchOnlyCommits: 2,
      goneUpstream: null
    })
  })

  it('counts a branch whose name has slashes, excluding only itself', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature/login/form')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('branch', 'feature/login-copy', 'main')
    await repo.git('checkout', '-q', 'main')

    await expect(readBranchDeletion(repo.root, 'feature/login/form')).resolves.toMatchObject({
      name: 'feature/login/form',
      branchOnlyCommits: 1
    })
  })

  it('counts commits kept by a tag as safe', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('tag', '-a', '-m', 'Release', 'v1')
    await repo.git('checkout', '-q', 'main')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      branchOnlyCommits: 0
    })
  })

  it('counts commits kept by a remote-tracking branch as safe', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('push', '-q', '-u', 'origin', 'feature')
    await repo.write('b.txt')
    await repo.commit('B unpushed')
    await repo.git('checkout', '-q', 'main')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      branchOnlyCommits: 1,
      goneUpstream: null
    })
  })

  it('names an upstream that is gone, and counts its commits', async () => {
    const repo = await createRepoWithCommit()
    const origin = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('push', '-q', '-u', 'origin', 'feature')
    await repo.git('checkout', '-q', 'main')
    // Squash-merged and deleted on the hosting service, then pruned by a fetch.
    await origin.git('branch', '-D', 'feature')
    await repo.git('fetch', '-q', '--prune')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      branchOnlyCommits: 1,
      goneUpstream: { name: 'origin/feature', remote: 'origin' }
    })
  })

  it('does not count a detached HEAD as somewhere the commits are kept', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('checkout', '-q', '--detach', 'feature')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      branchOnlyCommits: 1
    })
  })

  it('offers an upstream with a different name, counting what deleting it too would lose', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'foo')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('push', '-q', '-u', 'origin', 'foo:bar')
    await repo.git('checkout', '-q', 'main')

    await expect(readBranchDeletion(repo.root, 'foo')).resolves.toEqual({
      name: 'foo',
      oid: (await repo.git('rev-parse', 'foo')).trim(),
      branchOnlyCommits: 0,
      goneUpstream: null,
      deletableUpstream: {
        name: 'origin/bar',
        remote: 'origin',
        oid: (await repo.git('rev-parse', 'origin/bar')).trim(),
        branchOnlyCommits: 1
      }
    })
  })

  it('counts commits only an upstream ahead of the branch has, once it is deleted too', async () => {
    const repo = await createRepoWithCommit()
    const origin = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', '-u', 'origin', 'feature')
    // A collaborator pushes two commits the branch is behind.
    const collaborator = await cloneRepo(origin)
    await collaborator.git('checkout', '-q', 'feature')
    await collaborator.write('c.txt')
    await collaborator.commit('C')
    await collaborator.write('d.txt')
    await collaborator.commit('D')
    await collaborator.git('push', '-q', 'origin', 'feature')
    await repo.git('fetch', '-q')
    await repo.git('checkout', '-q', 'main')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      branchOnlyCommits: 0,
      deletableUpstream: {
        name: 'origin/feature',
        oid: (await collaborator.git('rev-parse', 'feature')).trim(),
        branchOnlyCommits: 2
      }
    })
  })

  it('never offers the branch the remote’s HEAD points at', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', '-u', 'origin', 'feature')
    await repo.git('checkout', '-q', 'main')
    await repo.git('remote', 'set-head', 'origin', 'feature')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      deletableUpstream: null
    })
  })

  it('offers no upstream that is gone, or that is a local branch', async () => {
    const repo = await createRepoWithCommit()
    const origin = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', '-u', 'origin', 'feature')
    await repo.git('checkout', '-q', '-b', 'stacked', '--track', 'feature')
    await repo.git('checkout', '-q', 'main')
    await origin.git('branch', '-D', 'feature')
    await repo.git('fetch', '-q', '--prune')

    await expect(readBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
      goneUpstream: { name: 'origin/feature' },
      deletableUpstream: null
    })
    await expect(readBranchDeletion(repo.root, 'stacked')).resolves.toMatchObject({
      goneUpstream: null,
      deletableUpstream: null
    })
  })

  it('fails for a branch that does not exist', async () => {
    const repo = await createRepoWithCommit()

    await expect(readBranchDeletion(repo.root, 'nope')).rejects.toBeInstanceOf(GitError)
  })
})

async function branchExists(repo: TestRepo, name: string): Promise<boolean> {
  return (await repo.git('branch', '--list', name)).trim() !== ''
}

describe('deleteBranch', () => {
  it('deletes a branch with branch-only commits, which git -d would refuse', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature/login')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('checkout', '-q', 'main')
    const { oid } = await readBranchDeletion(repo.root, 'feature/login')

    await deleteBranch(repo.root, 'feature/login', oid)

    expect(await branchExists(repo, 'feature/login')).toBe(false)
  })

  it('deletes a branch while HEAD is detached', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    await repo.git('checkout', '-q', '--detach')
    const { oid } = await readBranchDeletion(repo.root, 'feature')

    await deleteBranch(repo.root, 'feature', oid)

    expect(await branchExists(repo, 'feature')).toBe(false)
  })

  it('deletes nothing when the branch has moved since it was read', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature')
    const { oid } = await readBranchDeletion(repo.root, 'feature')
    await repo.write('a.txt')
    await repo.commit('A, after the dialog opened')
    await repo.git('checkout', '-q', 'main')

    await expect(deleteBranch(repo.root, 'feature', oid)).rejects.toMatchObject({
      code: 'BRANCH_MOVED',
      message: 'This branch has changed since you opened this. Close and try again.'
    })
    expect(await branchExists(repo, 'feature')).toBe(true)
  })

  it('refuses a branch checked out in another work tree', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    const elsewhere = join(await makeTempDir(), 'other tree')
    await repo.git('worktree', 'add', '-q', elsewhere, 'feature')
    const { oid } = await readBranchDeletion(repo.root, 'feature')

    await expect(deleteBranch(repo.root, 'feature', oid)).rejects.toBeInstanceOf(GitError)
    expect(await branchExists(repo, 'feature')).toBe(true)
  })
})

/** `foo` pushed to origin as `bar`, with a bare origin; the repository back on main. */
async function branchWithUpstream(): Promise<{ repo: TestRepo; origin: TestRepo }> {
  const repo = await createRepoWithCommit()
  const origin = await addBareRemote(repo)
  await repo.git('checkout', '-q', '-b', 'foo')
  await repo.write('a.txt')
  await repo.commit('A')
  await repo.git('push', '-q', '-u', 'origin', 'foo:bar')
  await repo.git('checkout', '-q', 'main')
  return { repo, origin }
}

async function remoteHas(origin: TestRepo, name: string): Promise<boolean> {
  return (await origin.git('branch', '--list', name)).trim() !== ''
}

describe('deleteBranch with its upstream', () => {
  it('deletes the upstream from the remote, then the branch', async () => {
    const { repo, origin } = await branchWithUpstream()
    const { oid, deletableUpstream } = await readBranchDeletion(repo.root, 'foo')

    await deleteBranch(repo.root, 'foo', oid, deletableUpstream?.oid ?? null)

    expect(await remoteHas(origin, 'bar')).toBe(false)
    expect(await branchExists(repo, 'foo')).toBe(false)
    expect((await repo.git('branch', '-r', '--list', 'origin/bar')).trim()).toBe('')
  })

  it('leaves the upstream alone when not asked to delete it', async () => {
    const { repo, origin } = await branchWithUpstream()
    const { oid } = await readBranchDeletion(repo.root, 'foo')

    await deleteBranch(repo.root, 'foo', oid, null)

    expect(await remoteHas(origin, 'bar')).toBe(true)
    expect(await branchExists(repo, 'foo')).toBe(false)
  })

  it('deletes nothing when someone pushed to the upstream since it was read', async () => {
    const { repo, origin } = await branchWithUpstream()
    const { oid, deletableUpstream } = await readBranchDeletion(repo.root, 'foo')
    const collaborator = await cloneRepo(origin)
    await collaborator.git('checkout', '-q', 'bar')
    await collaborator.write('c.txt')
    await collaborator.commit('C, after the dialog opened')
    await collaborator.git('push', '-q', 'origin', 'bar')

    await expect(
      deleteBranch(repo.root, 'foo', oid, deletableUpstream?.oid ?? null)
    ).rejects.toMatchObject({
      code: 'BRANCH_MOVED',
      message: 'This branch has changed since you opened this. Close and try again.'
    })
    expect(await remoteHas(origin, 'bar')).toBe(true)
    expect(await branchExists(repo, 'foo')).toBe(true)
  })

  it('deletes nothing, on the remote either, when the branch has moved', async () => {
    const { repo, origin } = await branchWithUpstream()
    const { oid, deletableUpstream } = await readBranchDeletion(repo.root, 'foo')
    await repo.git('checkout', '-q', 'foo')
    await repo.write('b.txt')
    await repo.commit('B, after the dialog opened')
    await repo.git('checkout', '-q', 'main')

    await expect(
      deleteBranch(repo.root, 'foo', oid, deletableUpstream?.oid ?? null)
    ).rejects.toMatchObject({ code: 'BRANCH_MOVED' })
    expect(await remoteHas(origin, 'bar')).toBe(true)
    expect(await branchExists(repo, 'foo')).toBe(true)
  })

  it('keeps both, with git’s words, when the remote refuses', async () => {
    const { repo, origin } = await branchWithUpstream()
    await writeFile(
      join(origin.root, 'hooks', 'pre-receive'),
      '#!/bin/sh\necho "bar is protected" >&2\nexit 1\n',
      {
        mode: 0o755
      }
    )
    const { oid, deletableUpstream } = await readBranchDeletion(repo.root, 'foo')

    const failure = deleteBranch(repo.root, 'foo', oid, deletableUpstream?.oid ?? null)

    await expect(failure).rejects.toMatchObject({ code: 'COMMAND_FAILED' })
    await expect(failure).rejects.toThrow(/bar is protected/)
    expect(await remoteHas(origin, 'bar')).toBe(true)
    expect(await branchExists(repo, 'foo')).toBe(true)
  })

  it('deletes nothing when the upstream is no longer there to delete', async () => {
    const { repo, origin } = await branchWithUpstream()
    const { oid, deletableUpstream } = await readBranchDeletion(repo.root, 'foo')
    await origin.git('branch', '-D', 'bar')
    await repo.git('fetch', '-q', '--prune')

    await expect(
      deleteBranch(repo.root, 'foo', oid, deletableUpstream?.oid ?? null)
    ).rejects.toMatchObject({ code: 'BRANCH_MOVED' })
    expect(await branchExists(repo, 'foo')).toBe(true)
  })
})

describe('undeletableBranches', () => {
  it('lists the current branch and the default branch', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'work')
    await repo.git('branch', 'other')

    expect(await undeletableBranches(repo.root)).toEqual(new Set(['work', 'main']))
  })

  it('lists a branch checked out in another work tree', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature/in-tree')
    await repo.git('branch', 'other')
    await repo.git('worktree', 'add', '-q', join(await makeTempDir(), 'tree'), 'feature/in-tree')

    expect(await undeletableBranches(repo.root)).toEqual(new Set(['main', 'feature/in-tree']))
  })

  it('lists the unborn current branch of a repository with no commits', async () => {
    const repo = await createRepo('work')

    expect(await undeletableBranches(repo.root)).toEqual(new Set(['work']))
  })

  it('lists only the default branch while HEAD is detached', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    await repo.git('checkout', '-q', '--detach')

    expect(await undeletableBranches(repo.root)).toEqual(new Set(['main']))
  })
})

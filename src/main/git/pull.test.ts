import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { listBranches } from './branches'
import { pullFastForward } from './pull'
import { cleanupTestRepos, cloneRepo, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

describe('pullFastForward', () => {
  it('fast-forwards the current branch onto its upstream', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')

    await pullFastForward(clone.root)

    const main = (await listBranches(clone.root)).find((branch) => branch.name === 'main')
    expect(main?.behind).toBe(0)
    expect((await clone.git('log', '-1', '--format=%s')).trim()).toBe('Upstream commit')
  })
})

describe('pullFastForward and a dirty work tree', () => {
  it('pulls with a dirty file the incoming commits do not touch, keeping the change', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')
    await clone.write('local.txt', 'work in progress\n')
    await clone.git('add', 'local.txt')

    await pullFastForward(clone.root)

    expect((await clone.git('log', '-1', '--format=%s')).trim()).toBe('Upstream commit')
    expect(await readFile(join(clone.root, 'local.txt'), 'utf8')).toBe('work in progress\n')
  })

  it('refuses, leaving the work tree alone, when the incoming commits touch a dirty file', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    await origin.write('README.md', 'from upstream\n')
    await origin.commit('Upstream edit')
    await clone.write('README.md', 'mine, uncommitted\n')

    await expect(pullFastForward(clone.root)).rejects.toMatchObject({
      code: 'COMMAND_FAILED'
    })
    expect(await readFile(join(clone.root, 'README.md'), 'utf8')).toBe('mine, uncommitted\n')
  })
})

describe('pullFastForward when it cannot fast-forward', () => {
  it('fails with PULL_NOT_FAST_FORWARD when the branch has diverged', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')
    await clone.write('local.txt')
    await clone.commit('Local commit')

    await expect(pullFastForward(clone.root)).rejects.toMatchObject({
      code: 'PULL_NOT_FAST_FORWARD'
    })
  })

  it('leaves the diverged branch where it was', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')
    await clone.write('local.txt')
    await clone.commit('Local commit')

    await expect(pullFastForward(clone.root)).rejects.toMatchObject({
      code: 'PULL_NOT_FAST_FORWARD'
    })

    expect((await clone.git('log', '-1', '--format=%s')).trim()).toBe('Local commit')
  })
})

describe('pullFastForward when there is nothing to pull from', () => {
  it('succeeds, changing nothing, when the branch is already up to date', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    const before = (await clone.git('rev-parse', 'HEAD')).trim()

    await pullFastForward(clone.root)

    expect((await clone.git('rev-parse', 'HEAD')).trim()).toBe(before)
  })

  it('succeeds when the branch is only ahead of its upstream', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.write('local.txt')
    await clone.commit('Local commit')

    await pullFastForward(clone.root)

    expect((await clone.git('log', '-1', '--format=%s')).trim()).toBe('Local commit')
  })

  it('fails with DETACHED_HEAD when HEAD is not on a branch', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.git('checkout', '-q', '--detach')

    await expect(pullFastForward(clone.root)).rejects.toMatchObject({ code: 'DETACHED_HEAD' })
  })

  it('fails with NO_UPSTREAM when the branch tracks nothing', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.git('checkout', '-q', '-b', 'solo')

    await expect(pullFastForward(clone.root)).rejects.toMatchObject({ code: 'NO_UPSTREAM' })
  })

  it('fails with NO_UPSTREAM in a repository with no commits', async () => {
    const repo = await createRepo()

    await expect(pullFastForward(repo.root)).rejects.toMatchObject({ code: 'NO_UPSTREAM' })
  })

  it('fails with NO_UPSTREAM when the upstream is gone from the remote', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    await clone.git('checkout', '-q', '-b', 'feature')
    // Set in config rather than with --set-upstream-to, which refuses a ref that is already
    // gone. This is the state a prune leaves behind: an upstream configured, but not there.
    await clone.git('config', 'branch.feature.remote', 'origin')
    await clone.git('config', 'branch.feature.merge', 'refs/heads/nothing-here')

    await expect(pullFastForward(clone.root)).rejects.toMatchObject({ code: 'NO_UPSTREAM' })
  })

  it('does not prompt for credentials, failing fast instead', async () => {
    const repo = await createRepoWithCommit()
    // An https remote nothing can authenticate to: the upstream ref exists locally, so the
    // pull really does reach the network and must come back rather than wait on a terminal.
    await repo.git('remote', 'add', 'origin', 'https://127.0.0.1:1/private.git')
    await repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    await repo.git('branch', '--set-upstream-to=origin/main', 'main')

    await expect(pullFastForward(repo.root)).rejects.toMatchObject({ code: 'COMMAND_FAILED' })
  }, 20_000)
})

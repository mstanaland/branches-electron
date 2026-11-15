import { afterAll, describe, expect, it } from 'vitest'
import { listBranches } from './branches'
import { GitError } from './errors'
import { fetchRemote, hasRemote } from './fetch'
import { cleanupTestRepos, cloneRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

describe('hasRemote', () => {
  it('is false for a repository with no remote', async () => {
    const repo = await createRepoWithCommit()

    await expect(hasRemote(repo.root)).resolves.toBe(false)
  })

  it('is true for a clone', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())

    await expect(hasRemote(clone.root)).resolves.toBe(true)
  })
})

describe('fetchRemote', () => {
  it('moves the upstream ref, so the branch reports behind by one', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')

    const result = await fetchRemote(clone.root)

    expect(result.changed).toBe(true)
    const main = (await listBranches(clone.root)).find((branch) => branch.name === 'main')
    expect(main?.behind).toBe(1)
  })

  it('reports no change when the remote has nothing new', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())

    await expect(fetchRemote(clone.root)).resolves.toEqual({ changed: false })
  })

  it('reports a change when a pruned remote branch disappears', async () => {
    const origin = await createRepoWithCommit()
    await origin.git('branch', 'gone-soon')
    const clone = await cloneRepo(origin)
    await origin.git('branch', '-D', 'gone-soon')

    await expect(fetchRemote(clone.root)).resolves.toEqual({ changed: true })
  })

  it('fails with a GitError when the remote cannot be reached', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('remote', 'add', 'origin', '/nowhere/there-is-no-repository-here')

    await expect(fetchRemote(repo.root)).rejects.toThrow(GitError)
  })

  it('does not prompt for credentials, failing fast instead', async () => {
    const repo = await createRepoWithCommit()
    // An https remote nothing can authenticate to: without the prompt-killing environment
    // this would hang a child process waiting on a terminal that isn't there.
    await repo.git('remote', 'add', 'origin', 'https://127.0.0.1:1/private.git')

    await expect(fetchRemote(repo.root)).rejects.toThrow(GitError)
  }, 20_000)
})

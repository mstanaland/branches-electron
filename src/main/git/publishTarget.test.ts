import { afterAll, describe, expect, it } from 'vitest'
import { getPublishTarget } from './publishTarget'
import { addBareRemote, cleanupTestRepos, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

describe('getPublishTarget', () => {
  it('lists every remote alphabetically, with its push URL', async () => {
    const repo = await createRepoWithCommit()
    const origin = await addBareRemote(repo)
    const fork = await addBareRemote(repo, 'backup')
    await repo.git('remote', 'set-url', '--push', 'origin', 'https://example.com/push.git')

    const target = await getPublishTarget(repo.root)

    expect(target.branch).toBe('main')
    expect(target.remotes.map(({ name, url }) => ({ name, url }))).toEqual([
      { name: 'backup', url: fork.root },
      { name: 'origin', url: 'https://example.com/push.git' }
    ])
    expect(origin.root).not.toBe(fork.root)
  })

  it('says which remotes already have the current branch, from local refs', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    await addBareRemote(repo, 'fork')
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', 'fork', 'feature')
    // A ref under the branch's name, but deeper: not the branch itself.
    await repo.git('update-ref', 'refs/remotes/origin/feature-two', 'HEAD')

    const target = await getPublishTarget(repo.root)

    expect(target.remotes.map(({ name, hasBranch }) => ({ name, hasBranch }))).toEqual([
      { name: 'fork', hasBranch: true },
      { name: 'origin', hasBranch: false }
    ])
    expect(target.goneFrom).toBeNull()
  })

  it('names the remote a gone upstream was on', async () => {
    const repo = await createRepoWithCommit()
    const fork = await addBareRemote(repo, 'fork')
    await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', '-u', 'fork', 'feature')
    await fork.git('branch', '-D', 'feature')
    await repo.git('fetch', '-q', '--prune', 'fork')

    expect((await getPublishTarget(repo.root)).goneFrom).toBe('fork')
  })

  it('has no gone remote for an upstream that is still there', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)

    expect((await getPublishTarget(repo.root)).goneFrom).toBeNull()
  })

  it('has no branch when HEAD is detached', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    await repo.git('checkout', '-q', '--detach')

    const target = await getPublishTarget(repo.root)

    expect(target.branch).toBeNull()
    expect(target.remotes).toEqual([{ name: 'origin', url: expect.any(String), hasBranch: false }])
  })

  it('has no remotes in a repository without one, even with no commits', async () => {
    const repo = await createRepo()

    expect(await getPublishTarget(repo.root)).toEqual({
      branch: 'main',
      remotes: [],
      goneFrom: null
    })
  })
})

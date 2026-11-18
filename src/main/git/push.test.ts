import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { publishBranch, pushBranch } from './push'
import {
  addBareRemote,
  cleanupTestRepos,
  cloneRepo,
  createRepo,
  createRepoWithCommit,
  makeTempDir,
  testRepoAt
} from './test-repo'

afterAll(cleanupTestRepos)

async function head(repo: { git: (...args: string[]) => Promise<string> }, ref: string) {
  return (await repo.git('rev-parse', ref)).trim()
}

describe('pushBranch', () => {
  it('sends the current branch to its upstream', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    await repo.write('local.txt')
    await repo.commit('Local commit')

    await pushBranch(repo.root)

    expect(await head(remote, 'refs/heads/main')).toBe(await head(repo, 'HEAD'))
  })

  it('pushes to an upstream with a different name, which push.default=simple would refuse', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'foo')
    await repo.git('push', '-q', 'origin', 'foo:bar')
    await repo.git('branch', '-q', '--set-upstream-to=origin/bar')
    await repo.git('config', 'push.default', 'simple')
    await repo.write('foo.txt')
    await repo.commit('Foo commit')

    await pushBranch(repo.root)

    expect(await head(remote, 'refs/heads/bar')).toBe(await head(repo, 'HEAD'))
    expect(await remote.git('for-each-ref', 'refs/heads/foo')).toBe('')
  })

  it('pushes the branch only, never its tags', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    await repo.write('local.txt')
    await repo.commit('Local commit')
    await repo.git('tag', '-a', '-m', 'v1', 'v1')
    await repo.git('config', 'push.followTags', 'true')

    await pushBranch(repo.root)

    expect(await remote.git('tag')).toBe('')
  })
})

describe('pushBranch when there is nowhere to push', () => {
  it('fails with DETACHED_HEAD when HEAD is not on a branch, touching nothing remote', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    await repo.git('checkout', '-q', '--detach')

    await expect(pushBranch(repo.root)).rejects.toMatchObject({ code: 'DETACHED_HEAD' })
  })

  it('fails with NO_UPSTREAM when the branch tracks nothing', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'solo')

    await expect(pushBranch(repo.root)).rejects.toMatchObject({ code: 'NO_UPSTREAM' })
    expect(await remote.git('for-each-ref', 'refs/heads/solo')).toBe('')
  })

  it('fails with NO_UPSTREAM when the upstream is gone from the remote', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', '-u', 'origin', 'feature')
    await remote.git('branch', '-D', 'feature')
    await repo.git('fetch', '-q', '--prune')

    await expect(pushBranch(repo.root)).rejects.toMatchObject({ code: 'NO_UPSTREAM' })
    expect(await remote.git('for-each-ref', 'refs/heads/feature')).toBe('')
  })

  it('fails with NO_UPSTREAM in a repository with no commits', async () => {
    const repo = await createRepo()

    await expect(pushBranch(repo.root)).rejects.toMatchObject({ code: 'NO_UPSTREAM' })
  })
})

/** A repository and a second clone of its bare remote, which moves the remote on. */
async function withMovedRemote() {
  const repo = await createRepoWithCommit()
  const remote = await addBareRemote(repo)
  const other = await cloneRepo(remote)
  await other.write('elsewhere.txt')
  await other.commit('Pushed from elsewhere')
  await other.git('push', '-q')
  return { repo, remote }
}

describe('pushBranch when the remote has commits the branch lacks', () => {
  it('fails with PUSH_REJECTED telling the user to Pull first when only behind', async () => {
    const { repo, remote } = await withMovedRemote()
    await repo.git('fetch', '-q')
    const before = await head(remote, 'refs/heads/main')

    const error = await pushBranch(repo.root).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'PUSH_REJECTED' })
    expect((error as Error).message).toMatch(/Pull first/)
    expect(await head(remote, 'refs/heads/main')).toBe(before)
  })

  it('fails with PUSH_REJECTED saying the branch has diverged, never forcing', async () => {
    const { repo, remote } = await withMovedRemote()
    await repo.write('local.txt')
    await repo.commit('Local commit')
    await repo.git('fetch', '-q')
    const before = await head(remote, 'refs/heads/main')

    const error = await pushBranch(repo.root).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'PUSH_REJECTED' })
    expect((error as Error).message).toMatch(/diverged/)
    expect(await head(remote, 'refs/heads/main')).toBe(before)
  })

  it('says diverged when the remote moved since the last fetch and the branch is ahead', async () => {
    const { repo } = await withMovedRemote()
    await repo.write('local.txt')
    await repo.commit('Local commit')

    const error = await pushBranch(repo.root).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'PUSH_REJECTED' })
    expect((error as Error).message).toMatch(/diverged/)
  })
})

describe('pushBranch and refused credentials', () => {
  it('does not prompt, failing fast with COMMAND_FAILED', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('remote', 'add', 'origin', 'https://127.0.0.1:1/private.git')
    await repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    await repo.git('branch', '--set-upstream-to=origin/main', 'main')
    await repo.write('local.txt')
    await repo.commit('Local commit')

    await expect(pushBranch(repo.root)).rejects.toMatchObject({ code: 'COMMAND_FAILED' })
  }, 20_000)
})

describe('publishBranch', () => {
  it('creates the branch on the remote and makes it the upstream', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('feature.txt')
    await repo.commit('Feature commit')

    await publishBranch(repo.root, 'origin')

    expect(await head(remote, 'refs/heads/feature')).toBe(await head(repo, 'HEAD'))
    expect((await repo.git('rev-parse', '--abbrev-ref', '@{upstream}')).trim()).toBe(
      'origin/feature'
    )
  })

  it('creates a gone upstream again', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', '-u', 'origin', 'feature')
    await remote.git('branch', '-D', 'feature')
    await repo.git('fetch', '-q', '--prune')

    await publishBranch(repo.root, 'origin')

    expect(await head(remote, 'refs/heads/feature')).toBe(await head(repo, 'HEAD'))
    await pushBranch(repo.root)
  })

  it('publishes to the remote it is given when there are several', async () => {
    const repo = await createRepoWithCommit()
    const origin = await addBareRemote(repo)
    const fork = await addBareRemote(repo, 'fork')
    await repo.git('checkout', '-q', '-b', 'feature')

    await publishBranch(repo.root, 'fork')

    expect(await fork.git('for-each-ref', '--format=%(refname)', 'refs/heads/feature')).toBe(
      'refs/heads/feature\n'
    )
    expect(await origin.git('for-each-ref', 'refs/heads/feature')).toBe('')
    expect((await repo.git('rev-parse', '--abbrev-ref', '@{upstream}')).trim()).toBe('fork/feature')
  })

  it('fails with DETACHED_HEAD when HEAD is not on a branch', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    await repo.git('checkout', '-q', '--detach')

    await expect(publishBranch(repo.root, 'origin')).rejects.toMatchObject({
      code: 'DETACHED_HEAD'
    })
  })

  it('fails with PUSH_REJECTED when the remote already has a branch of that name it can’t fast-forward', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    const other = await cloneRepo(remote)
    await other.git('checkout', '-q', '-b', 'feature')
    await other.write('theirs.txt')
    await other.commit('Their feature')
    await other.git('push', '-q', 'origin', 'feature')
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('mine.txt')
    await repo.commit('My feature')

    const error = await publishBranch(repo.root, 'origin').catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'PUSH_REJECTED' })
    // Not "Pull first": a branch being published has no upstream to pull from.
    expect((error as Error).message).toBe(
      'origin already has a feature with commits this one doesn’t. Publishing won’t overwrite it.'
    )
    expect(await repo.git('config', '--get', 'branch.feature.remote').catch(() => '')).toBe('')
  })
})

describe('pushBranch across remotes', () => {
  it('pushes to an upstream on a remote other than origin', async () => {
    const repo = await createRepoWithCommit()
    const origin = await addBareRemote(repo)
    const fork = await addBareRemote(repo, 'fork')
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.git('push', '-q', '-u', 'fork', 'feature')
    await repo.write('feature.txt')
    await repo.commit('Feature commit')

    await pushBranch(repo.root)

    expect(await head(fork, 'refs/heads/feature')).toBe(await head(repo, 'HEAD'))
    expect(await origin.git('for-each-ref', 'refs/heads/feature')).toBe('')
  })

  it('fails with NO_UPSTREAM in a repository with no remote', async () => {
    const repo = await createRepoWithCommit()

    await expect(pushBranch(repo.root)).rejects.toMatchObject({ code: 'NO_UPSTREAM' })
  })

  it('pushes from a repository whose path has spaces', async () => {
    const source = await createRepoWithCommit()
    const remote = await addBareRemote(source)
    const root = join(await makeTempDir(), 'my repo')
    await source.git('clone', '-q', remote.root, root)
    const repo = testRepoAt(root)
    await repo.git('config', 'user.name', 'Test')
    await repo.git('config', 'user.email', 'test@example.com')
    await repo.write('a file.txt')
    await repo.commit('Spaced commit')

    await pushBranch(repo.root)

    expect(await head(remote, 'refs/heads/main')).toBe(await head(repo, 'HEAD'))
  })
})

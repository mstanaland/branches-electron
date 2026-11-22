import { afterAll, describe, expect, it } from 'vitest'
import { cleanupTestRepos, cloneRepo, createRepo, createRepoWithCommit } from './test-repo'
import { listUnpushedCommits } from './unpushed'

afterAll(cleanupTestRepos)

async function oid(repo: { git: (...args: string[]) => Promise<string> }, ref: string) {
  return (await repo.git('rev-parse', ref)).trim()
}

/**
 * A branch pushed, squash-merged on the remote, and its remote branch deleted: what is
 * left after a pull request on GitHub. Returns the clone and the head the PR merged.
 */
async function squashMergedBranch() {
  const source = await createRepoWithCommit()
  const clone = await cloneRepo(source)
  await clone.git('checkout', '-q', '-b', 'feature')
  await clone.write('a.txt')
  await clone.commit('A')
  await clone.write('b.txt')
  await clone.commit('B')
  await clone.git('push', '-q', '-u', 'origin', 'feature')
  await source.git('merge', '-q', '--squash', 'feature')
  await source.commit('Feature (#1)')
  await source.git('branch', '-q', '-D', 'feature')
  await clone.git('fetch', '-q', '--prune')
  return { clone, head: await oid(clone, 'feature') }
}

describe('listUnpushedCommits', () => {
  it('is empty for a branch level with its upstream', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())

    expect(await listUnpushedCommits(clone.root, 'main')).toEqual([])
  })

  it('lists the commits made since the last push', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.write('a.txt')
    await clone.commit('A')
    await clone.write('b.txt')
    await clone.commit('B')

    const unpushed = await listUnpushedCommits(clone.root, 'main')
    expect(unpushed.toSorted()).toEqual(
      [await oid(clone, 'HEAD'), await oid(clone, 'HEAD~1')].toSorted()
    )
  })

  it('counts a new branch only from where it left a pushed one', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.git('checkout', '-q', '-b', 'work')
    await clone.write('work.txt')
    await clone.commit('Work')

    expect(await listUnpushedCommits(clone.root, 'work')).toEqual([await oid(clone, 'work')])
  })

  it('judges against every remote-tracking branch, not just the upstream', async () => {
    const source = await createRepoWithCommit()
    await source.git('checkout', '-q', '-b', 'other')
    await source.write('other.txt')
    await source.commit('Other')
    await source.git('checkout', '-q', 'main')
    const clone = await cloneRepo(source)
    // A local branch with no upstream, sitting on a commit only origin/other has.
    await clone.git('branch', 'mine', 'origin/other')

    expect(await listUnpushedCommits(clone.root, 'mine')).toEqual([])
  })

  it('lists a merge and the work it brought in', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.git('checkout', '-q', '-b', 'side')
    await clone.write('side.txt')
    await clone.commit('Side')
    await clone.git('checkout', '-q', 'main')
    await clone.write('main.txt')
    await clone.commit('Main')
    await clone.git('merge', '-q', '--no-ff', '--no-edit', 'side')

    const unpushed = await listUnpushedCommits(clone.root, 'main')
    expect(unpushed).toHaveLength(3)
    expect(unpushed).toContain(await oid(clone, 'side'))
  })

  it('takes a detached HEAD by its oid', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.git('checkout', '-q', '--detach')
    await clone.write('detached.txt')
    await clone.commit('Detached')
    const head = await oid(clone, 'HEAD')

    expect(await listUnpushedCommits(clone.root, head)).toEqual([head])
  })

  it('handles a branch name with spaces in its paths and slashes in its name', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.git('checkout', '-q', '-b', 'feature/login')
    await clone.write('with space.txt')
    await clone.commit('Spaced')

    expect(await listUnpushedCommits(clone.root, 'feature/login')).toHaveLength(1)
  })

  describe('given the head of the pull request that merged the branch', () => {
    it('lists the merged commits without it, since no remote-tracking branch has them', async () => {
      const { clone } = await squashMergedBranch()

      expect(await listUnpushedCommits(clone.root, 'feature')).toHaveLength(2)
    })

    it('does not list the commits the pull request carried', async () => {
      const { clone, head } = await squashMergedBranch()

      expect(await listUnpushedCommits(clone.root, 'feature', [head])).toEqual([])
    })

    it('still lists a commit made after the merge', async () => {
      const { clone, head } = await squashMergedBranch()
      await clone.write('c.txt')
      await clone.commit('C')

      expect(await listUnpushedCommits(clone.root, 'feature', [head])).toEqual([
        await oid(clone, 'feature')
      ])
    })

    it('ignores a head that is not here', async () => {
      const { clone } = await squashMergedBranch()

      expect(await listUnpushedCommits(clone.root, 'feature', ['f'.repeat(40)])).toHaveLength(2)
    })

    it('ignores anything that is not a full oid', async () => {
      const { clone } = await squashMergedBranch()

      for (const head of ['--all', 'origin/main', 'feature', 'abc1234']) {
        expect(await listUnpushedCommits(clone.root, 'feature', [head])).toHaveLength(2)
      }
    })
  })

  it('is empty with no remote, rather than every commit', async () => {
    const repo = await createRepoWithCommit()

    expect(await listUnpushedCommits(repo.root, 'main')).toEqual([])
  })

  it('is empty with a remote never fetched from', async () => {
    const repo = await createRepoWithCommit()
    const other = await createRepoWithCommit()
    await repo.git('remote', 'add', 'origin', other.root)

    expect(await listUnpushedCommits(repo.root, 'main')).toEqual([])
  })

  it('is empty in a repository with no commits', async () => {
    const repo = await createRepo()
    const other = await cloneRepo(await createRepoWithCommit())
    await repo.git('remote', 'add', 'origin', other.root)
    await repo.git('fetch', '-q', 'origin')

    expect(await listUnpushedCommits(repo.root, 'main')).toEqual([])
  })
})

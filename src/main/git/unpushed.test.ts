import { afterAll, describe, expect, it } from 'vitest'
import { cleanupTestRepos, cloneRepo, createRepo, createRepoWithCommit } from './test-repo'
import { listUnpushedCommits } from './unpushed'

afterAll(cleanupTestRepos)

async function oid(repo: { git: (...args: string[]) => Promise<string> }, ref: string) {
  return (await repo.git('rev-parse', ref)).trim()
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

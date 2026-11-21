import { afterAll, describe, expect, it } from 'vitest'
import { readCommitContext } from './commitContext'
import { cleanupTestRepos, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

describe('readCommitContext', () => {
  it('reads only the staged diff: not unstaged edits, not untracked files', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('staged.txt', 'staged line\n')
    await repo.git('add', 'staged.txt')
    await repo.write('README.md', 'unstaged edit\n')
    await repo.write('untracked.txt', 'untracked line\n')

    const context = await readCommitContext(repo.root)

    expect(context.stagedDiff).toContain('+staged line')
    expect(context.stagedDiff).not.toContain('unstaged edit')
    expect(context.stagedDiff).not.toContain('untracked line')
    expect(context.truncated).toBe(false)
  })

  it('shows a staged rename as a rename, and keeps a path with spaces whole', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('mv', 'README.md', 'docs and notes.md')

    const { stagedDiff } = await readCommitContext(repo.root)

    expect(stagedDiff).toContain('rename from README.md')
    expect(stagedDiff).toContain('rename to docs and notes.md')
  })

  it('gives the recent commit subjects, newest first', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('a.txt')
    await repo.commit('Add a')
    await repo.write('b.txt')
    await repo.commit('Add b')

    const { recentSubjects } = await readCommitContext(repo.root)

    expect(recentSubjects).toEqual(['Add b', 'Add a', 'Initial commit'])
  })

  it('works in a repository with no commits: everything staged is new, no subjects', async () => {
    const repo = await createRepo()
    await repo.write('first.txt', 'first line\n')
    await repo.git('add', 'first.txt')

    const context = await readCommitContext(repo.root)

    expect(context.stagedDiff).toContain('+first line')
    expect(context.recentSubjects).toEqual([])
  })

  it('cuts a large staged diff short and says so', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('big.txt', 'x'.repeat(100) + '\n'.repeat(1) + 'y\n'.repeat(80_000))
    await repo.git('add', 'big.txt')

    const context = await readCommitContext(repo.root, { maxDiffBytes: 10_000 })

    expect(context.truncated).toBe(true)
    expect(context.stagedDiff.length).toBeLessThanOrEqual(10_000)
  })

  it('reads a detached HEAD’s history', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('a.txt')
    await repo.commit('Add a')
    await repo.git('checkout', '-q', '--detach', 'HEAD~1')

    const { recentSubjects } = await readCommitContext(repo.root)

    expect(recentSubjects).toEqual(['Initial commit'])
  })

  it('reads a repository in the middle of a merge conflict without failing', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'other')
    await repo.write('README.md', 'other side\n')
    await repo.commit('Change README on other')
    await repo.git('checkout', '-q', 'main')
    await repo.write('README.md', 'main side\n')
    await repo.commit('Change README on main')
    await repo.git('merge', 'other').catch(() => {})
    await repo.write('resolved.txt', 'resolved\n')
    await repo.git('add', 'resolved.txt')

    const context = await readCommitContext(repo.root)

    expect(context.stagedDiff).toContain('+resolved')
    expect(context.recentSubjects[0]).toBe('Change README on main')
  })
})

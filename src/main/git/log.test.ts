import { afterAll, describe, expect, it } from 'vitest'
import { findDefaultBranchBase, listCommits, parseCommits } from './log'
import { cleanupTestRepos, createRepo, createRepoWithCommit, type TestRepo } from './test-repo'

afterAll(cleanupTestRepos)

describe('listCommits', () => {
  it('returns commits newest first, with the fields the history shows', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('second.txt')
    await repo.commit('Second commit')

    const commits = await listCommits(repo.root, 'main', 100, 0)

    expect(commits.map((commit) => commit.subject)).toEqual(['Second commit', 'Initial commit'])
    const [second, first] = commits
    expect(second.oid).toMatch(/^[0-9a-f]{40}$/)
    expect(second.shortOid).toBe(second.oid.slice(0, 8))
    expect(second.authorName).toBe('Test')
    expect(second.authorDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(second.parents).toEqual([first.oid])
    // A root commit has no parents, which is how the graph knows its lane closes.
    expect(first.parents).toEqual([])
  })

  it('is empty in a repository with no commits, rather than failing', async () => {
    const repo = await createRepo()

    expect(await listCommits(repo.root, 'HEAD', 100, 0)).toEqual([])
    expect(await listCommits(repo.root, 'main', 100, 0)).toEqual([])
  })

  it('lists a branch that is not checked out', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'work')
    await repo.write('work.txt')
    await repo.commit('Work commit')
    await repo.git('checkout', '-q', 'main')

    const commits = await listCommits(repo.root, 'work', 100, 0)
    expect(commits.map((commit) => commit.subject)).toEqual(['Work commit', 'Initial commit'])
  })

  it('takes a raw oid as the ref, which is how later pages are anchored', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('second.txt')
    await repo.commit('Second commit')
    const [tip] = await listCommits(repo.root, 'main', 1, 0)

    // The branch moves on, but the anchored oid still walks the history it walked before.
    await repo.write('third.txt')
    await repo.commit('Third commit')

    const commits = await listCommits(repo.root, tip.oid, 100, 0)
    expect(commits.map((commit) => commit.subject)).toEqual(['Second commit', 'Initial commit'])
  })

  it('pages with limit and skip', async () => {
    const repo = await createRepo()
    for (let i = 1; i <= 5; i++) {
      await repo.write(`file${i}.txt`)
      await repo.commit(`Commit ${i}`)
    }

    const first = await listCommits(repo.root, 'main', 2, 0)
    const second = await listCommits(repo.root, 'main', 2, 2)
    const third = await listCommits(repo.root, 'main', 2, 4)

    expect(first.map((commit) => commit.subject)).toEqual(['Commit 5', 'Commit 4'])
    expect(second.map((commit) => commit.subject)).toEqual(['Commit 3', 'Commit 2'])
    expect(third.map((commit) => commit.subject)).toEqual(['Commit 1'])
    expect(await listCommits(repo.root, 'main', 2, 5)).toEqual([])
  })

  it('reports both parents of a merge', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'side')
    await repo.write('side.txt')
    await repo.commit('Side commit')
    await repo.git('checkout', '-q', 'main')
    await repo.write('main.txt')
    await repo.commit('Main commit')
    await repo.git('merge', '-q', '--no-ff', '-m', 'Merge side', 'side')

    const commits = await listCommits(repo.root, 'main', 100, 0)
    const merge = commits[0]
    expect(merge.subject).toBe('Merge side')
    expect(merge.parents).toHaveLength(2)
    // Topological order keeps the side branch together rather than interleaving it by date.
    expect(commits.map((commit) => commit.subject)).toEqual([
      'Merge side',
      'Side commit',
      'Main commit',
      'Initial commit'
    ])
  })

  it('keeps a subject that contains the characters the format is built from', async () => {
    const repo = await createRepo()
    await repo.write('a.txt')
    // Newlines can't reach a subject (it is the first line), but the rest can.
    await repo.commit('Subject with "quotes", a %H, a tab\tand trailing spaces  ')

    const [commit] = await listCommits(repo.root, 'main', 100, 0)
    expect(commit.subject).toBe('Subject with "quotes", a %H, a tab\tand trailing spaces')
  })

  it('takes only the first line of the message as the subject', async () => {
    const repo = await createRepo()
    await repo.write('a.txt')
    await repo.git('add', '-A')
    await repo.git('commit', '-q', '-m', 'The subject', '-m', 'The description, below it.')

    const [commit] = await listCommits(repo.root, 'main', 100, 0)
    expect(commit.subject).toBe('The subject')
  })

  it('handles a detached HEAD', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('second.txt')
    await repo.commit('Second commit')
    await repo.git('checkout', '-q', '--detach', 'HEAD~1')

    const commits = await listCommits(repo.root, 'HEAD', 100, 0)
    expect(commits.map((commit) => commit.subject)).toEqual(['Initial commit'])
  })
})

describe('parseCommits', () => {
  it('returns nothing for empty output', () => {
    expect(parseCommits('')).toEqual([])
  })

  it('drops a short group left by a trailing separator', () => {
    const record = ['a'.repeat(40), '', 'Test', '2026-11-15T12:00:00Z', 'Only one'].join('\0')
    expect(parseCommits(`${record}\0`)).toHaveLength(1)
  })

  it('splits several parents on spaces', () => {
    const parents = ['b'.repeat(40), 'c'.repeat(40)]
    const record = [
      'a'.repeat(40),
      parents.join(' '),
      'Test',
      '2026-11-15T12:00:00Z',
      'A merge'
    ].join('\0')

    expect(parseCommits(record)[0].parents).toEqual(parents)
  })
})

async function head(repo: TestRepo, ref: string): Promise<string> {
  return (await repo.git('rev-parse', ref)).trim()
}

describe('findDefaultBranchBase', () => {
  it('is where a branch forked from the default branch', async () => {
    const repo = await createRepoWithCommit()
    const fork = await head(repo, 'main')
    await repo.git('checkout', '-q', '-b', 'work')
    await repo.write('work.txt')
    await repo.commit('Work commit')
    await repo.git('checkout', '-q', 'main')
    await repo.write('main.txt')
    await repo.commit('Main commit')

    expect(await findDefaultBranchBase(repo.root, 'work')).toEqual({ oid: fork, movedOn: true })
  })

  it("is the default branch's tip once a branch has merged it in", async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'work')
    await repo.write('work.txt')
    await repo.commit('Work commit')
    await repo.git('checkout', '-q', 'main')
    await repo.write('main.txt')
    await repo.commit('Main commit')
    const tip = await head(repo, 'main')
    await repo.git('checkout', '-q', 'work')
    await repo.git('merge', '-q', '--no-edit', 'main')

    expect(await findDefaultBranchBase(repo.root, 'work')).toEqual({ oid: tip, movedOn: false })
    // A raw oid, as a detached HEAD is listed by.
    expect(await findDefaultBranchBase(repo.root, await head(repo, 'work'))).toEqual({
      oid: tip,
      movedOn: false
    })

    // The default branch moves on again after being merged in.
    await repo.git('checkout', '-q', 'main')
    await repo.write('later.txt')
    await repo.commit('Later main commit')
    expect(await findDefaultBranchBase(repo.root, 'work')).toEqual({ oid: tip, movedOn: true })
  })

  it("is the default branch's own tip for the default branch", async () => {
    const repo = await createRepoWithCommit()
    expect(await findDefaultBranchBase(repo.root, 'main')).toEqual({
      oid: await head(repo, 'main'),
      movedOn: false
    })
  })

  it('is null for a branch with no history in common', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '--orphan', 'other')
    await repo.write('other.txt')
    await repo.commit('Other root')

    expect(await findDefaultBranchBase(repo.root, 'other')).toBeNull()
  })

  it('is null without a default branch, and in a repository with no commits', async () => {
    expect(
      await findDefaultBranchBase((await createRepoWithCommit('feature')).root, 'feature')
    ).toBeNull()
    expect(await findDefaultBranchBase((await createRepo()).root, 'main')).toBeNull()
  })
})

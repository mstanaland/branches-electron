import { afterAll, describe, expect, it } from 'vitest'
import { getCommitDetails } from './commitDetails'
import { GitError } from './errors'
import { cleanupTestRepos, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

async function head(git: (...args: string[]) => Promise<string>, rev = 'HEAD'): Promise<string> {
  return (await git('rev-parse', rev)).trim()
}

describe('getCommitDetails', () => {
  it('reads the author, committer, dates and commit ID of a commit', async () => {
    const repo = await createRepoWithCommit()
    const oid = await head(repo.git)

    const details = await getCommitDetails(repo.root, oid)

    expect(details.oid).toBe(oid)
    expect(details.authorName).toBe('Test')
    expect(details.authorEmail).toBe('test@example.com')
    expect(details.committerName).toBe('Test')
    expect(details.committerEmail).toBe('test@example.com')
    expect(details.authorDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(details.committerDate).toBe(details.authorDate)
  })

  it('has an empty description when the message is only a subject', async () => {
    const repo = await createRepoWithCommit()

    const details = await getCommitDetails(repo.root, await head(repo.git))

    expect(details.description).toBe('')
  })

  it('keeps every paragraph and line break of the description, and nothing of the subject', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('second.txt')
    await repo.git('add', '-A')
    const description =
      'First paragraph,\nwrapped.\n\nSecond paragraph.\n\nCo-Authored-By: A <a@b.c>'
    await repo.git('commit', '-q', '-m', 'The subject', '-m', description)

    const details = await getCommitDetails(repo.root, await head(repo.git))

    expect(details.description).toBe(description)
  })

  it('tells the author apart from the committer', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('second.txt')
    await repo.git('add', '-A')
    await repo.git(
      'commit',
      '-q',
      '-m',
      'Written by someone else',
      '--author=Zoë Ångström <zoe@example.com>',
      '--date=2001-02-03T04:05:06Z'
    )

    const details = await getCommitDetails(repo.root, await head(repo.git))

    expect(details.authorName).toBe('Zoë Ångström')
    expect(details.authorEmail).toBe('zoe@example.com')
    expect(new Date(details.authorDate).toISOString()).toBe('2001-02-03T04:05:06.000Z')
    expect(details.committerName).toBe('Test')
    expect(details.committerDate).not.toBe(details.authorDate)
  })

  it('reads a merge commit', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'side')
    await repo.write('side.txt')
    await repo.commit('Side commit')
    await repo.git('checkout', '-q', 'main')
    await repo.write('main.txt')
    await repo.commit('Main commit')
    await repo.git('merge', '-q', '--no-ff', '-m', 'Merge side', 'side')

    const details = await getCommitDetails(repo.root, await head(repo.git))

    expect(details.authorName).toBe('Test')
    expect(details.description).toBe('')
  })

  it('fails for an oid that names a file rather than a commit', async () => {
    const repo = await createRepoWithCommit()
    const blob = (await repo.git('rev-parse', 'HEAD:README.md')).trim()

    await expect(getCommitDetails(repo.root, blob)).rejects.toBeInstanceOf(GitError)
  })

  it('fails for an oid that names no commit', async () => {
    const repo = await createRepo()

    await expect(getCommitDetails(repo.root, '0'.repeat(40))).rejects.toBeInstanceOf(GitError)
  })
})

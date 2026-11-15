import { readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { stageFiles, unstageFiles } from './staging'
import { cleanupTestRepos, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

/** The porcelain XY code for one path, e.g. "M " for a staged modification. */
async function code(repo: { git: (...args: string[]) => Promise<string> }, path: string) {
  const status = await repo.git('status', '--porcelain', '--', path)
  return status.slice(0, 2)
}

describe('stageFiles', () => {
  it('stages a modified file', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('README.md', 'changed\n')

    await stageFiles(repo.root, ['README.md'])

    expect(await code(repo, 'README.md')).toBe('M ')
  })

  it('stages a new file', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('new.txt')

    await stageFiles(repo.root, ['new.txt'])

    expect(await code(repo, 'new.txt')).toBe('A ')
  })

  it('stages a deleted file', async () => {
    const repo = await createRepoWithCommit()
    await rm(join(repo.root, 'README.md'))

    await stageFiles(repo.root, ['README.md'])

    expect(await code(repo, 'README.md')).toBe('D ')
  })

  it('stages nothing when given no paths', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('untouched.txt')

    await stageFiles(repo.root, [])

    expect(await code(repo, 'untouched.txt')).toBe('??')
  })
})

describe('unstageFiles', () => {
  it('unstages a staged modification, leaving the work tree alone', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('README.md', 'changed\n')
    await repo.git('add', 'README.md')

    await unstageFiles(repo.root, ['README.md'])

    expect(await code(repo, 'README.md')).toBe(' M')
    expect(await readFile(join(repo.root, 'README.md'), 'utf8')).toBe('changed\n')
  })
})

describe('unstageFiles in a repository with no commits', () => {
  it('unstages a new file, leaving it untracked', async () => {
    const repo = await createRepo()
    await repo.write('a.txt')
    await repo.git('add', 'a.txt')

    await unstageFiles(repo.root, ['a.txt'])

    expect(await code(repo, 'a.txt')).toBe('??')
    expect(await readFile(join(repo.root, 'a.txt'), 'utf8')).toBe('a.txt\n')
  })

  it('unstages a partially staged file, keeping the work tree contents', async () => {
    const repo = await createRepo()
    await repo.write('a.txt', 'staged\n')
    await repo.git('add', 'a.txt')
    await repo.write('a.txt', 'later\n')

    await unstageFiles(repo.root, ['a.txt'])

    expect(await code(repo, 'a.txt')).toBe('??')
    expect(await readFile(join(repo.root, 'a.txt'), 'utf8')).toBe('later\n')
  })
})

describe('renames', () => {
  it('stages a rename as one entry, and unstages it back to a deletion and an untracked file', async () => {
    const repo = await createRepoWithCommit()
    // Renamed in the work tree, not with `git mv`, so nothing is staged yet: the list shows
    // this as a deletion and an untracked file, and staging both is what makes it a rename.
    await rename(join(repo.root, 'README.md'), join(repo.root, 'docs.md'))

    await stageFiles(repo.root, ['docs.md', 'README.md'])
    expect(await repo.git('diff', '--cached', '--name-status', '-M')).toContain('R100')

    await unstageFiles(repo.root, ['docs.md', 'README.md'])

    expect(await code(repo, 'README.md')).toBe(' D')
    expect(await code(repo, 'docs.md')).toBe('??')
  })
})

describe('conflicts', () => {
  it('marks a conflicted path resolved when it is staged', async () => {
    const repo = await conflictedRepo()
    expect(await code(repo, 'f.txt')).toBe('UU')

    await stageFiles(repo.root, ['f.txt'])

    expect(await code(repo, 'f.txt')).toBe('M ')
  })

  it('drops a conflicted path from the index when it is unstaged', async () => {
    const repo = await conflictedRepo()

    await unstageFiles(repo.root, ['f.txt'])

    expect(await code(repo, 'f.txt')).toBe(' M')
  })
})

describe('detached HEAD', () => {
  it('stages and unstages against the detached commit', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('second.txt')
    await repo.commit('second')
    await repo.git('checkout', '--detach', 'HEAD')
    await repo.write('README.md', 'changed\n')

    await stageFiles(repo.root, ['README.md'])
    expect(await code(repo, 'README.md')).toBe('M ')

    await unstageFiles(repo.root, ['README.md'])
    expect(await code(repo, 'README.md')).toBe(' M')
  })
})

/** A repository stopped mid-merge, with f.txt left unmerged. */
async function conflictedRepo() {
  const repo = await createRepo()
  await repo.write('f.txt', 'base\n')
  await repo.commit('base')
  await repo.git('checkout', '-q', '-b', 'other')
  await repo.write('f.txt', 'theirs\n')
  await repo.commit('theirs')
  await repo.git('checkout', '-q', 'main')
  await repo.write('f.txt', 'ours\n')
  await repo.commit('ours')
  // The merge is meant to fail: that is what leaves the conflict behind.
  await repo.git('merge', 'other').catch(() => {})
  return repo
}

/** Names git could read as options or pathspec patterns if they weren't passed literally. */
const awkwardNames = ['a file.txt', '-dash.txt', '--cached', '[a].md', 'star*.txt', 'what?.log']

describe('awkward paths', () => {
  it.each(awkwardNames)('stages and unstages a file named %s and nothing else', async (name) => {
    const repo = await createRepoWithCommit()
    await repo.write(name)
    await repo.write('other.txt')

    await stageFiles(repo.root, [name])
    expect(await code(repo, name)).toBe('A ')
    expect(await code(repo, 'other.txt')).toBe('??')

    await unstageFiles(repo.root, [name])
    expect(await code(repo, name)).toBe('??')
  })

  // The no-commits branch of unstageFiles is a different git command, so it gets its own pass.
  it.each(awkwardNames)(
    'stages and unstages a file named %s in a repository with no commits',
    async (name) => {
      const repo = await createRepo()
      await repo.write(name)
      await repo.write('other.txt')

      await stageFiles(repo.root, [name])
      expect(await code(repo, name)).toBe('A ')
      expect(await code(repo, 'other.txt')).toBe('??')

      await unstageFiles(repo.root, [name])
      expect(await code(repo, name)).toBe('??')
    }
  )
})

describe('overlapping writes', () => {
  it('runs two writes to one repository one after the other, in order', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('README.md', 'changed\n')

    // Started together: without the queue these would fight over .git/index.lock.
    // In order the file ends unstaged; the other order would leave it staged.
    await Promise.all([
      stageFiles(repo.root, ['README.md']),
      unstageFiles(repo.root, ['README.md'])
    ])

    expect(await code(repo, 'README.md')).toBe(' M')
  })

  it('lets many writes started at once all land', async () => {
    const repo = await createRepoWithCommit()
    const names = Array.from({ length: 20 }, (_, i) => `file-${i}.txt`)
    await Promise.all(names.map((name) => repo.write(name)))

    await Promise.all(names.map((name) => stageFiles(repo.root, [name])))

    for (const name of names) expect(await code(repo, name)).toBe('A ')
  })
})

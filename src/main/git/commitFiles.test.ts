import { chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { FileDiff } from '../../shared/git'
import { getCommitFileDiff, listCommitFiles } from './commitFiles'
import { GitError } from './errors'
import { cleanupTestRepos, createRepo, createRepoWithCommit, type TestRepo } from './test-repo'

afterAll(cleanupTestRepos)

async function head(repo: TestRepo, rev = 'HEAD'): Promise<string> {
  return (await repo.git('rev-parse', rev)).trim()
}

/** The hunks of a diff that is known not to be binary. */
function hunksOf(diff: FileDiff) {
  if (diff.binary) throw new Error('expected a text diff')
  return diff.hunks
}

/** Every line of a diff as "+text", "-text" or " text". */
function linesOf(diff: FileDiff): string[] {
  const signs = { context: ' ', added: '+', removed: '-' }
  return hunksOf(diff).flatMap((hunk) => hunk.lines.map((line) => signs[line.kind] + line.text))
}

describe('listCommitFiles', () => {
  it('lists added, modified and deleted files against the parent', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('gone.txt')
    await repo.write('kept.txt', 'one\n')
    await repo.commit('Second')
    await repo.git('rm', '-q', 'gone.txt')
    await repo.write('kept.txt', 'two\n')
    await repo.write('new.txt')
    await repo.commit('Third')

    const files = await listCommitFiles(repo.root, await head(repo))

    expect(files).toEqual([
      { kind: 'deleted', path: 'gone.txt', originalPath: null },
      { kind: 'modified', path: 'kept.txt', originalPath: null },
      { kind: 'added', path: 'new.txt', originalPath: null }
    ])
  })

  it('detects a rename, keeping the path it came from', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('mv', 'README.md', 'Read me.md')
    await repo.commit('Move it')

    const files = await listCommitFiles(repo.root, await head(repo))

    expect(files).toEqual([{ kind: 'renamed', path: 'Read me.md', originalPath: 'README.md' }])
  })

  it('does not detect copies', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('README.md', 'a long enough line to be copied\n'.repeat(5))
    await repo.commit('Fill it')
    await repo.write('copy.md', 'a long enough line to be copied\n'.repeat(5))
    await repo.commit('Copy it')

    const files = await listCommitFiles(repo.root, await head(repo))

    expect(files).toEqual([{ kind: 'added', path: 'copy.md', originalPath: null }])
  })

  it('shows every file of a root commit as added', async () => {
    const repo = await createRepo()
    await repo.write('a.txt')
    await repo.write('b c.txt')
    await repo.commit('Root')

    const files = await listCommitFiles(repo.root, await head(repo))

    expect(files).toEqual([
      { kind: 'added', path: 'a.txt', originalPath: null },
      { kind: 'added', path: 'b c.txt', originalPath: null }
    ])
  })

  it('compares a merge with its first parent', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'side')
    await repo.write('side.txt')
    await repo.commit('Side commit')
    await repo.git('checkout', '-q', 'main')
    await repo.write('main.txt')
    await repo.commit('Main commit')
    await repo.git('merge', '-q', '--no-ff', '-m', 'Merge side', 'side')

    const files = await listCommitFiles(repo.root, await head(repo))

    expect(files).toEqual([{ kind: 'added', path: 'side.txt', originalPath: null }])
  })

  it('lists nothing for an empty commit', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('commit', '-q', '--allow-empty', '-m', 'Empty')

    expect(await listCommitFiles(repo.root, await head(repo))).toEqual([])
  })

  it('lists a mode-only change as modified', async () => {
    const repo = await createRepoWithCommit()
    await chmod(join(repo.root, 'README.md'), 0o755)
    await repo.commit('Make it executable')

    expect(await listCommitFiles(repo.root, await head(repo))).toEqual([
      { kind: 'modified', path: 'README.md', originalPath: null }
    ])
  })

  it('fails for an oid that names a file rather than a commit', async () => {
    const repo = await createRepoWithCommit()
    const blob = await head(repo, 'HEAD:README.md')

    await expect(listCommitFiles(repo.root, blob)).rejects.toBeInstanceOf(GitError)
  })
})

describe('getCommitFileDiff', () => {
  it('diffs a modified file against the parent', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('README.md', 'changed\n')
    await repo.commit('Change it')

    const diff = await getCommitFileDiff(repo.root, await head(repo), 'README.md', null)

    expect(linesOf(diff)).toEqual(['-README.md', '+changed'])
  })

  it('diffs one file only, at a path with spaces', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('with space.txt', 'one\n')
    await repo.write('README.md', 'also changed\n')
    await repo.commit('Change two')

    const diff = await getCommitFileDiff(repo.root, await head(repo), 'with space.txt', null)

    expect(linesOf(diff)).toEqual(['+one'])
  })

  it('shows a rename with edits as one diff, not a delete and an add', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('old name.txt', 'one\ntwo\nthree\nfour\nfive\n')
    await repo.commit('Add it')
    await repo.git('mv', 'old name.txt', 'new name.txt')
    await repo.write('new name.txt', 'one\ntwo\nthree\nfour\nFIVE\n')
    await repo.commit('Rename and edit it')

    const diff = await getCommitFileDiff(
      repo.root,
      await head(repo),
      'new name.txt',
      'old name.txt'
    )

    expect(linesOf(diff)).toEqual([' two', ' three', ' four', '-five', '+FIVE'])
  })

  it('shows a file of a root commit as all added', async () => {
    const repo = await createRepo()
    await repo.write('a.txt', 'one\ntwo\n')
    await repo.commit('Root')

    const diff = await getCommitFileDiff(repo.root, await head(repo), 'a.txt', null)

    expect(linesOf(diff)).toEqual(['+one', '+two'])
  })

  it('diffs a merge against its first parent', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'side')
    await repo.write('side.txt', 'from side\n')
    await repo.commit('Side commit')
    await repo.git('checkout', '-q', 'main')
    await repo.write('main.txt')
    await repo.commit('Main commit')
    await repo.git('merge', '-q', '--no-ff', '-m', 'Merge side', 'side')

    const diff = await getCommitFileDiff(repo.root, await head(repo), 'side.txt', null)

    expect(linesOf(diff)).toEqual(['+from side'])
  })

  it('reports a binary file as binary', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('image.bin', '\0\x01\x02binary\0')
    await repo.commit('Add a binary')

    const diff = await getCommitFileDiff(repo.root, await head(repo), 'image.bin', null)

    expect(diff).toEqual({ binary: true })
  })

  it('gives a mode-only change no hunks', async () => {
    const repo = await createRepoWithCommit()
    await chmod(join(repo.root, 'README.md'), 0o755)
    await repo.commit('Make it executable')

    const diff = await getCommitFileDiff(repo.root, await head(repo), 'README.md', null)

    expect(diff).toEqual({ binary: false, hunks: [], truncated: false })
  })

  it('cuts a very large diff short and says so', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('big.txt', 'a line of text that repeats\n'.repeat(60_000))
    await repo.commit('Add a big file')

    const diff = await getCommitFileDiff(repo.root, await head(repo), 'big.txt', null)

    expect(diff.binary).toBe(false)
    expect(!diff.binary && diff.truncated).toBe(true)
  })
})

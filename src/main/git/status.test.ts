import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { FileChange } from '../../shared/git'
import { getStatus, parseStatus } from './status'
import { cleanupTestRepos, cloneRepo, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

function byPath(changes: FileChange[]): Record<string, FileChange> {
  return Object.fromEntries(changes.map((change) => [change.path, change]))
}

describe('getStatus', () => {
  it('reports a clean repository', async () => {
    const repo = await createRepoWithCommit()
    const status = await getStatus(repo.root)

    expect(status.branch).toBe('main')
    expect(status.detached).toBe(false)
    expect(status.headOid).toMatch(/^[0-9a-f]{7}$/)
    expect(status.upstream).toBeNull()
    expect(status.changes).toEqual([])
  })

  it('handles a repository with no commits', async () => {
    const repo = await createRepo()
    await repo.write('new.txt')
    const status = await getStatus(repo.root)

    expect(status.branch).toBe('main')
    expect(status.headOid).toBeNull()
    expect(status.changes).toEqual([
      { path: 'new.txt', originalPath: null, index: null, worktree: null, kind: 'untracked' }
    ])
  })

  it('reports staged, unstaged, deleted and untracked files', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('tracked.txt')
    await repo.write('doomed.txt')
    await repo.commit('Add files')

    await repo.write('README.md', 'changed\n') // unstaged edit
    await repo.write('staged.txt')
    await repo.git('add', 'staged.txt') // staged add
    await repo.write('tracked.txt', 'changed\n')
    await repo.git('add', 'tracked.txt')
    await repo.write('tracked.txt', 'changed again\n') // staged and unstaged
    await repo.git('rm', '-q', 'doomed.txt') // staged delete
    await repo.write('nested/deep/untracked.txt') // untracked, in a new folder

    const changes = byPath((await getStatus(repo.root)).changes)

    expect(changes['README.md']).toMatchObject({ index: 'unmodified', worktree: 'modified' })
    expect(changes['staged.txt']).toMatchObject({ index: 'added', worktree: 'unmodified' })
    expect(changes['tracked.txt']).toMatchObject({ index: 'modified', worktree: 'modified' })
    expect(changes['doomed.txt']).toMatchObject({ index: 'deleted', worktree: 'unmodified' })
    // --untracked-files=all lists the file, not just its folder.
    expect(changes['nested/deep/untracked.txt']).toMatchObject({ kind: 'untracked' })
  })

  it('keeps paths with spaces and non-ASCII characters intact', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('my folder/a file.txt')
    await repo.write('café ☕️.md')

    const paths = (await getStatus(repo.root)).changes.map((change) => change.path).toSorted()
    expect(paths).toEqual(['café ☕️.md', 'my folder/a file.txt'])
  })

  it('parses renames without losing the entries after them', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('old name.txt', 'a fairly long line so rename detection is confident\n')
    await repo.write('zzz.txt')
    await repo.commit('Add files')

    await repo.git('mv', 'old name.txt', 'new name.txt')
    await repo.write('zzz.txt', 'changed\n') // sorts after the rename
    await repo.write('untracked.txt')

    const changes = byPath((await getStatus(repo.root)).changes)

    expect(changes['new name.txt']).toEqual({
      path: 'new name.txt',
      originalPath: 'old name.txt',
      index: 'renamed',
      worktree: 'unmodified',
      kind: 'renamed'
    })
    expect(changes['zzz.txt']).toMatchObject({ worktree: 'modified', kind: 'ordinary' })
    expect(changes['untracked.txt']).toMatchObject({ kind: 'untracked' })
    expect(Object.keys(changes)).toHaveLength(3)
  })

  it('reports merge conflicts as unmerged', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'other')
    await repo.write('README.md', 'other\n')
    await repo.commit('Change on other')
    await repo.git('checkout', '-q', 'main')
    await repo.write('README.md', 'main\n')
    await repo.commit('Change on main')
    await repo.git('merge', 'other').catch(() => {}) // exits non-zero on conflict

    const [change] = (await getStatus(repo.root)).changes
    expect(change).toMatchObject({
      path: 'README.md',
      kind: 'unmerged',
      index: 'unmerged',
      worktree: 'unmerged'
    })
  })

  it('reports a detached HEAD', async () => {
    const repo = await createRepoWithCommit()
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()
    await repo.git('checkout', '-q', '--detach')

    const status = await getStatus(repo.root)
    expect(status.detached).toBe(true)
    expect(status.branch).toBeNull()
    expect(status.headOid).toBe(oid.slice(0, 7))
  })

  it('reports the upstream and ahead/behind counts', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)

    await origin.write('from-origin.txt')
    await origin.commit('On origin')
    await clone.git('fetch', '-q')
    await clone.write('local-1.txt')
    await clone.commit('Local 1')
    await clone.write('local-2.txt')
    await clone.commit('Local 2')

    const status = await getStatus(clone.root)
    expect(status.upstream).toBe('origin/main')
    expect(status.ahead).toBe(2)
    expect(status.behind).toBe(1)
  })

  it('sees a file renamed outside git as a delete plus an untracked file', async () => {
    const repo = await createRepoWithCommit()
    await rename(join(repo.root, 'README.md'), join(repo.root, 'README-2.md'))

    const changes = byPath((await getStatus(repo.root)).changes)
    expect(changes['README.md']).toMatchObject({ worktree: 'deleted' })
    expect(changes['README-2.md']).toMatchObject({ kind: 'untracked' })
  })
})

describe('parseStatus', () => {
  it('ignores empty output', () => {
    expect(parseStatus('').changes).toEqual([])
  })

  it('skips malformed entries instead of throwing', () => {
    const status = parseStatus('# branch.head main\x001 M\x00? ok.txt\x00')
    expect(status.branch).toBe('main')
    expect(status.changes.map((change) => change.path)).toEqual(['ok.txt'])
  })
})

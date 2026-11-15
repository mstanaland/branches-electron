import { mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { GitError } from './errors'
import { resolveRepositoryRoot } from './repository'
import { cleanupTestRepos, createRepoWithCommit, makeTempDir, testRepoAt } from './test-repo'

afterAll(cleanupTestRepos)

describe('resolveRepositoryRoot', () => {
  it('returns the root for the root itself', async () => {
    const repo = await createRepoWithCommit()
    expect(await resolveRepositoryRoot(repo.root)).toBe(repo.root)
  })

  it('resolves a subfolder to the root', async () => {
    const repo = await createRepoWithCommit()
    const sub = join(repo.root, 'a', 'b')
    await mkdir(sub, { recursive: true })
    expect(await resolveRepositoryRoot(sub)).toBe(repo.root)
  })

  it('resolves a symlink to the repository to the real root', async () => {
    const repo = await createRepoWithCommit()
    const parent = await makeTempDir()
    const link = join(parent, 'link-to-repo')
    await symlink(repo.root, link)
    expect(await resolveRepositoryRoot(link)).toBe(repo.root)
  })

  it('resolves a symlinked subfolder to the real root', async () => {
    const repo = await createRepoWithCommit()
    await mkdir(join(repo.root, 'a', 'b'), { recursive: true })
    const parent = await makeTempDir()
    const link = join(parent, 'link-to-sub')
    await symlink(join(repo.root, 'a', 'b'), link)
    expect(await resolveRepositoryRoot(link)).toBe(repo.root)
  })

  it('keeps whitespace at the end of a folder name', async () => {
    const parent = await makeTempDir()
    const root = join(parent, 'trailing space ')
    await mkdir(root)
    await testRepoAt(root).git('init')

    expect(await resolveRepositoryRoot(root)).toBe(root)
  })

  it('throws NOT_A_REPOSITORY for a plain folder', async () => {
    const dir = await makeTempDir()
    const error = await resolveRepositoryRoot(dir).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GitError)
    expect(error).toMatchObject({ code: 'NOT_A_REPOSITORY' })
  })
})

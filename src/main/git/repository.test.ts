import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { GitError } from './errors'
import { resolveRepositoryRoot } from './repository'
import { cleanupTestRepos, createRepoWithCommit, makeTempDir } from './test-repo'

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

  it('throws NOT_A_REPOSITORY for a plain folder', async () => {
    const dir = await makeTempDir()
    const error = await resolveRepositoryRoot(dir).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GitError)
    expect(error).toMatchObject({ code: 'NOT_A_REPOSITORY' })
  })
})

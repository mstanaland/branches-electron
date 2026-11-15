import { mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { assertInsideRoot } from './assertInsideRoot'
import { cleanupTestRepos, createRepoWithCommit, makeTempDir } from './git/test-repo'

afterAll(cleanupTestRepos)

describe('assertInsideRoot', () => {
  it('accepts a file in the repository, in a folder, or not there at all', async () => {
    const repo = await createRepoWithCommit()
    await mkdir(join(repo.root, 'src'))

    await expect(assertInsideRoot(repo.root, 'README.md')).resolves.toBeUndefined()
    await expect(assertInsideRoot(repo.root, 'src/new.ts')).resolves.toBeUndefined()
    await expect(assertInsideRoot(repo.root, 'gone/deeper/file.txt')).resolves.toBeUndefined()
  })

  it('accepts a symlink that sits inside the repository, even if it points elsewhere', async () => {
    const repo = await createRepoWithCommit()
    const outside = await makeTempDir()
    await symlink(outside, join(repo.root, 'link-file'))

    // The link itself is a file in the repository; git shows its target path, not its contents.
    await expect(assertInsideRoot(repo.root, 'link-file')).resolves.toBeUndefined()
  })

  it('rejects a path that goes through a folder symlinked outside the repository', async () => {
    const repo = await createRepoWithCommit()
    const outside = await makeTempDir()
    await symlink(outside, join(repo.root, 'escape'))

    await expect(assertInsideRoot(repo.root, 'escape/secret.txt')).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
  })

  it('accepts a folder symlinked to another place inside the repository', async () => {
    const repo = await createRepoWithCommit()
    await mkdir(join(repo.root, 'real'))
    await symlink(join(repo.root, 'real'), join(repo.root, 'alias'))

    await expect(assertInsideRoot(repo.root, 'alias/file.txt')).resolves.toBeUndefined()
  })
})

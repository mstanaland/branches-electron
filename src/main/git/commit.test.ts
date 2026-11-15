import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { commit } from './commit'
import { cleanupTestRepos, createRepo, createRepoWithCommit, type TestRepo } from './test-repo'

afterAll(cleanupTestRepos)

/**
 * The full message of the repository's newest commit, exactly as git stored it.
 * `-z` ends the record with a NUL instead of the newline `git log` would otherwise add,
 * so nothing is read back that the commit itself doesn't contain.
 */
async function headMessage(repo: TestRepo): Promise<string> {
  const stdout = await repo.git('log', '-1', '-z', '--format=%B')
  return stdout.replace(/\0$/, '')
}

/** Installs an executable hook in the test repository. */
async function installHook(repo: TestRepo, name: string, script: string): Promise<void> {
  const path = join(repo.root, '.git', 'hooks', name)
  await writeFile(path, script)
  await chmod(path, 0o755)
}

describe('commit', () => {
  it('commits what is staged, leaving unstaged work alone', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('staged.txt')
    await repo.write('unstaged.txt')
    await repo.git('add', 'staged.txt')

    await commit(repo.root, 'Add a staged file')

    expect(await headMessage(repo)).toBe('Add a staged file\n')
    expect(await repo.git('status', '--porcelain')).toBe('?? unstaged.txt\n')
  })

  it('keeps a multi-line message, and characters a shell would mangle, verbatim', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('notes.txt')
    await repo.git('add', 'notes.txt')
    const message = [
      'Fix $PATH handling in `run`',
      '',
      'Backticks, a \'quote\', a "double" one and a #hash all survive,',
      'because the message goes in on stdin rather than as an argument.'
    ].join('\n')

    await commit(repo.root, message)

    expect(await headMessage(repo)).toBe(`${message}\n`)
  })

  it('makes the first commit in a repository that has none', async () => {
    const repo = await createRepo()
    await repo.write('README.md')
    await repo.git('add', 'README.md')

    await commit(repo.root, 'Initial commit')

    expect(await headMessage(repo)).toBe('Initial commit\n')
  })

  it('fails when nothing is staged, and says so', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('unstaged.txt')

    await expect(commit(repo.root, 'Nothing here')).rejects.toMatchObject({
      name: 'GitError',
      code: 'COMMAND_FAILED'
    })
    await expect(commit(repo.root, 'Nothing here')).rejects.toThrow(/nothing (added )?to commit/i)
  })

  it('surfaces what a rejecting pre-commit hook printed', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('lint-me.txt')
    await repo.git('add', 'lint-me.txt')
    await installHook(repo, 'pre-commit', '#!/bin/sh\necho "lint failed: 3 problems" >&2\nexit 1\n')

    await expect(commit(repo.root, 'Should be rejected')).rejects.toThrow(/lint failed: 3 problems/)
    // The hook stopped it, so the change is still staged and HEAD has not moved.
    expect(await repo.git('status', '--porcelain')).toBe('A  lint-me.txt\n')
  })

  it('surfaces a rejecting commit-msg hook that only printed on stdout', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('messaged.txt')
    await repo.git('add', 'messaged.txt')
    await installHook(repo, 'commit-msg', '#!/bin/sh\necho "subject needs a ticket"\nexit 1\n')

    await expect(commit(repo.root, 'No ticket here')).rejects.toThrow(/subject needs a ticket/)
  })
})

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GitError } from './errors'
import { getGitExecutable, type GitExecutable } from './executable'
import { runGit } from './run'

vi.mock('./executable', () => ({ getGitExecutable: vi.fn<() => Promise<GitExecutable>>() }))

let dir: string
let stubGit: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'branches-run-'))
  // A fake git that prints one argument per line, so we can see exactly what runGit passed.
  stubGit = join(dir, 'git')
  await writeFile(stubGit, '#!/bin/sh\nfor arg in "$@"; do echo "$arg"; done\n')
  await chmod(stubGit, 0o755)
})

afterAll(() => rm(dir, { recursive: true, force: true }))

describe('runGit', () => {
  it('runs the located git binary with the global options first', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: stubGit, version: '2.43.0' })

    const { stdout } = await runGit('/some/root', ['status', '--short'])

    expect(stdout.trim().split('\n')).toEqual([
      '-C',
      '/some/root',
      '--no-optional-locks',
      'status',
      '--short'
    ])
  })

  it('fails with GIT_NOT_FOUND when no git can be located', async () => {
    vi.mocked(getGitExecutable).mockRejectedValue(
      new GitError('GIT_NOT_FOUND', 'git was not found on this computer.')
    )

    await expect(runGit('/some/root', ['status'])).rejects.toMatchObject({
      name: 'GitError',
      code: 'GIT_NOT_FOUND'
    })
  })
})

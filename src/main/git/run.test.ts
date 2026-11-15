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
let differingGit: string
let chattyGit: string
let echoingGit: string
let envPrintingGit: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'branches-run-'))
  // A fake git that prints one argument per line, so we can see exactly what runGit passed.
  stubGit = join(dir, 'git')
  await writeFile(stubGit, '#!/bin/sh\nfor arg in "$@"; do echo "$arg"; done\n')
  await chmod(stubGit, 0o755)
  // Like `git diff --no-index`: prints output and exits 1 to say "there are differences".
  differingGit = join(dir, 'differing-git')
  await writeFile(differingGit, '#!/bin/sh\necho differences\nexit "${STUB_EXIT:-1}"\n')
  await chmod(differingGit, 0o755)
  // Prints a few kilobytes of lines, then succeeds.
  chattyGit = join(dir, 'chatty-git')
  await writeFile(
    chattyGit,
    '#!/bin/sh\ni=0\nwhile [ $i -lt 500 ]; do echo "line $i"; i=$((i+1)); done\n'
  )
  await chmod(chattyGit, 0o755)
  // Echoes whatever it is given on stdin, so we can see what runGit wrote there.
  echoingGit = join(dir, 'echoing-git')
  await writeFile(echoingGit, '#!/bin/sh\ncat\n')
  await chmod(echoingGit, 0o755)
  // Prints the environment it was started with, so we can see what runGit set.
  envPrintingGit = join(dir, 'env-printing-git')
  await writeFile(envPrintingGit, '#!/bin/sh\nprintenv\n')
  await chmod(envPrintingGit, 0o755)
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
      '--literal-pathspecs',
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

  it('reports no truncation for ordinary output', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: stubGit, version: '2.43.0' })

    await expect(runGit('/some/root', ['status'])).resolves.toMatchObject({ truncated: false })
  })

  it('treats an exit code listed in okExitCodes as success, keeping its output', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: differingGit, version: '2.43.0' })

    const { stdout } = await runGit('/some/root', ['diff'], { okExitCodes: [1] })

    expect(stdout.trim()).toBe('differences')
  })

  it('still fails on an exit code that is not listed', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: differingGit, version: '2.43.0' })

    await expect(runGit('/some/root', ['diff'])).rejects.toMatchObject({ exitCode: 1 })
  })

  it('stops at maxOutput bytes and says so, instead of failing', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: chattyGit, version: '2.43.0' })

    const result = await runGit('/some/root', ['diff'], { maxOutput: 1000 })

    expect(result.truncated).toBe(true)
    expect(result.stdout.length).toBeGreaterThan(0)
    expect(result.stdout.length).toBeLessThanOrEqual(1000)
  })

  it('writes `input` to git on stdin', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: echoingGit, version: '2.43.0' })

    const { stdout } = await runGit('/some/root', ['commit', '-F', '-'], {
      input: "Subject\n\nA description with a 'quote' and a $dollar.\n"
    })

    expect(stdout).toBe("Subject\n\nA description with a 'quote' and a $dollar.\n")
  })

  it('closes stdin when there is no input, so git never waits on it', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: echoingGit, version: '2.43.0' })

    await expect(runGit('/some/root', ['status'])).resolves.toMatchObject({ stdout: '' })
  })

  it('carries what git printed on both streams on a failure', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: differingGit, version: '2.43.0' })

    await expect(runGit('/some/root', ['diff'])).rejects.toMatchObject({
      stdout: 'differences\n'
    })
  })

  it('leaves a repository\u2019s own ssh command in place', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: envPrintingGit, version: '2.43.0' })

    const { stdout } = await runGit('/some/root', ['fetch'])

    // Overriding it here would beat `core.sshCommand`, and with it the identity the remote needs.
    expect(stdout).not.toContain('GIT_SSH_COMMAND=')
  })

  it('leaves git no way to ask for credentials, so a fetch fails instead of hanging', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: envPrintingGit, version: '2.43.0' })

    const { stdout } = await runGit('/some/root', ['fetch'])
    const env = new Map(
      stdout
        .split('\n')
        .filter((line) => line.includes('='))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    )

    expect(env.get('GIT_TERMINAL_PROMPT')).toBe('0')
    expect(env.get('GIT_ASKPASS')).toBe('echo')
    expect(env.get('SSH_ASKPASS')).toBe('echo')
    expect(env.get('SSH_ASKPASS_REQUIRE')).toBe('never')
  })

  it('does not truncate output that fits within maxOutput', async () => {
    vi.mocked(getGitExecutable).mockResolvedValue({ path: chattyGit, version: '2.43.0' })

    const result = await runGit('/some/root', ['diff'], { maxOutput: 1_000_000 })

    expect(result.truncated).toBe(false)
    expect(result.stdout.trim().split('\n')).toHaveLength(500)
  })
})

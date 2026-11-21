import { chmod, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { CommitContext } from '../git/commitContext'
import { cleanupTestRepos, makeTempDir } from '../git/test-repo'
import { writeCommitMessage } from './generate'

afterAll(cleanupTestRepos)

const CONTEXT: CommitContext = {
  stagedDiff: 'diff --git a/README.md b/README.md\n+hello world\n',
  truncated: false,
  recentSubjects: ['Add the tab strip', 'Fix the title bar']
}

const EMPTY_DRAFT = { subject: '', description: '' }

interface FakeClaude {
  path: string
  /** What the fake was given on stdin, once it has run. */
  stdin: () => Promise<string>
  /** Its arguments, one per element, once it has run. */
  args: () => Promise<string[]>
}

/**
 * Writes a stand-in `claude`: a shell script that records its arguments and stdin, then runs
 * `body` — which decides what it prints and how it exits.
 */
async function fakeClaude(body: string): Promise<FakeClaude> {
  const dir = await makeTempDir()
  const path = join(dir, 'claude')
  await writeFile(
    path,
    [
      '#!/bin/sh',
      `for arg in "$@"; do printf '%s\\0' "$arg"; done > '${dir}/args'`,
      `cat > '${dir}/stdin'`,
      body
    ].join('\n')
  )
  await chmod(path, 0o755)
  return {
    path,
    stdin: () => readFile(join(dir, 'stdin'), 'utf8'),
    args: async () => (await readFile(join(dir, 'args'), 'utf8')).split('\0').slice(0, -1)
  }
}

/** A fake that answers like `claude -p --output-format json --json-schema …` does. */
function answering(message: { subject: string; description: string }): Promise<FakeClaude> {
  const result = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(message),
    structured_output: message
  })
  return fakeClaude(`printf '%s' '${result.replaceAll("'", `'"'"'`)}'`)
}

describe('writeCommitMessage', () => {
  it('returns the subject and description Claude Code wrote', async () => {
    const claude = await answering({
      subject: 'Say hello in the README',
      description: 'Greets whoever opens it first.'
    })

    await expect(
      writeCommitMessage({ claudePath: claude.path, context: CONTEXT, draft: EMPTY_DRAFT })
    ).resolves.toEqual({
      subject: 'Say hello in the README',
      description: 'Greets whoever opens it first.'
    })
  })

  it('sends the staged diff and the recent subjects on stdin', async () => {
    const claude = await answering({ subject: 'S', description: '' })

    await writeCommitMessage({ claudePath: claude.path, context: CONTEXT, draft: EMPTY_DRAFT })

    const stdin = await claude.stdin()
    expect(stdin).toContain('+hello world')
    expect(stdin).toContain('Add the tab strip')
    expect(stdin).toContain('Fix the title bar')
  })

  it('passes what the draft already holds as guidance', async () => {
    const claude = await answering({ subject: 'S', description: '' })

    await writeCommitMessage({
      claudePath: claude.path,
      context: CONTEXT,
      draft: { subject: 'greeting thing', description: 'for the onboarding work' }
    })

    const stdin = await claude.stdin()
    expect(stdin).toContain('greeting thing')
    expect(stdin).toContain('for the onboarding work')
  })

  it('says when the diff was cut short', async () => {
    const claude = await answering({ subject: 'S', description: '' })

    await writeCommitMessage({
      claudePath: claude.path,
      context: { ...CONTEXT, truncated: true },
      draft: EMPTY_DRAFT
    })

    expect(await claude.stdin()).toMatch(/truncated/i)
  })

  it('runs Claude Code with no tools, on Haiku, without saving a session', async () => {
    const claude = await answering({ subject: 'S', description: '' })

    await writeCommitMessage({ claudePath: claude.path, context: CONTEXT, draft: EMPTY_DRAFT })

    const args = await claude.args()
    expect(args.join(' ')).toContain('--model haiku')
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).toContain('--no-session-persistence')
    expect(args).toContain('-p')
  })

  it('trims what comes back', async () => {
    const claude = await answering({ subject: '  Tidy up  \n', description: '\nWhy.\n\n' })

    await expect(
      writeCommitMessage({ claudePath: claude.path, context: CONTEXT, draft: EMPTY_DRAFT })
    ).resolves.toEqual({ subject: 'Tidy up', description: 'Why.' })
  })

  it('fails with CLAUDE_FAILED, and says how to log in, when Claude Code is not logged in', async () => {
    const claude = await fakeClaude(
      `printf '%s' '{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}'; exit 1`
    )

    const error = await writeCommitMessage({
      claudePath: claude.path,
      context: CONTEXT,
      draft: EMPTY_DRAFT
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'CLAUDE_FAILED' })
    expect((error as Error).message).toMatch(/log in/i)
  })

  it('fails with CLAUDE_FAILED and Claude Code’s own words when it reports an error', async () => {
    const claude = await fakeClaude(
      `printf '%s' '{"type":"result","is_error":true,"result":"API Error: overloaded"}'`
    )

    const error = await writeCommitMessage({
      claudePath: claude.path,
      context: CONTEXT,
      draft: EMPTY_DRAFT
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'CLAUDE_FAILED' })
    expect((error as Error).message).toContain('API Error: overloaded')
  })

  it('fails with CLAUDE_FAILED when the output is not what was asked for', async () => {
    const claude = await fakeClaude(`printf 'not json at all'`)

    await expect(
      writeCommitMessage({ claudePath: claude.path, context: CONTEXT, draft: EMPTY_DRAFT })
    ).rejects.toMatchObject({ code: 'CLAUDE_FAILED' })
  })

  it('fails with CLAUDE_FAILED when it exits non-zero, with what it printed to stderr', async () => {
    const claude = await fakeClaude(`echo 'something broke' >&2; exit 3`)

    const error = await writeCommitMessage({
      claudePath: claude.path,
      context: CONTEXT,
      draft: EMPTY_DRAFT
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'CLAUDE_FAILED', exitCode: 3 })
    expect((error as Error).message).toContain('something broke')
  })

  it('fails with CLAUDE_NOT_FOUND when claude has gone since it was found', async () => {
    await expect(
      writeCommitMessage({
        claudePath: join(await makeTempDir(), 'claude'),
        context: CONTEXT,
        draft: EMPTY_DRAFT
      })
    ).rejects.toMatchObject({ code: 'CLAUDE_NOT_FOUND' })
  })

  it('gives up with GENERATE_TIMED_OUT when Claude Code takes too long', async () => {
    const claude = await fakeClaude('exec sleep 10')

    await expect(
      writeCommitMessage({
        claudePath: claude.path,
        context: CONTEXT,
        draft: EMPTY_DRAFT,
        timeoutMs: 200
      })
    ).rejects.toMatchObject({ code: 'GENERATE_TIMED_OUT' })
  })

  it('stops with GENERATE_CANCELLED when its signal aborts', async () => {
    const claude = await fakeClaude('exec sleep 10')
    const controller = new AbortController()

    const running = writeCommitMessage({
      claudePath: claude.path,
      context: CONTEXT,
      draft: EMPTY_DRAFT,
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 50)

    await expect(running).rejects.toMatchObject({ code: 'GENERATE_CANCELLED' })
  })
})

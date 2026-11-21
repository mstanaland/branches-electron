import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { CommitContext } from '../git/commitContext'
import { cleanupTestRepos, makeTempDir } from '../git/test-repo'
import { createCommitMessageGenerator } from './generator'

afterAll(cleanupTestRepos)

const CONTEXT: CommitContext = { stagedDiff: '+x\n', truncated: false, recentSubjects: [] }
const DRAFT = { subject: '', description: '' }

/**
 * A stand-in `claude` that answers with the repository it was asked about, after a pause
 * long enough to stop it in. The draft's subject names the repository, since that is what
 * reaches stdin.
 */
async function slowClaude(delaySeconds: number): Promise<string> {
  const path = join(await makeTempDir(), 'claude')
  await writeFile(
    path,
    [
      '#!/bin/sh',
      'subject=$(grep "^Subject: " | sed "s/^Subject: //")',
      `sleep ${delaySeconds}`,
      `printf '{"is_error":false,"structured_output":{"subject":"%s","description":""}}' "$subject"`
    ].join('\n')
  )
  await chmod(path, 0o755)
  return path
}

function generatorWith(claudePath: string) {
  return createCommitMessageGenerator({
    locate: async () => claudePath,
    readContext: async () => CONTEXT
  })
}

describe('createCommitMessageGenerator', () => {
  it('writes a message for a repository', async () => {
    const generator = generatorWith(await slowClaude(0))

    await expect(
      generator.generate('/repos/a', { subject: 'for a', description: '' })
    ).resolves.toEqual({ subject: 'for a', description: '' })
  })

  it('stops a run when asked, which then fails as GENERATE_CANCELLED', async () => {
    const generator = generatorWith(await slowClaude(10))

    const running = generator.generate('/repos/a', DRAFT)
    await new Promise((resolve) => setTimeout(resolve, 50))
    generator.cancel('/repos/a')

    await expect(running).rejects.toMatchObject({ code: 'GENERATE_CANCELLED' })
  })

  it('stops a run before Claude Code has even started', async () => {
    const generator = generatorWith(await slowClaude(10))

    const running = generator.generate('/repos/a', DRAFT)
    generator.cancel('/repos/a')

    await expect(running).rejects.toMatchObject({ code: 'GENERATE_CANCELLED' })
  })

  it('replaces a repository’s earlier run with a newer one', async () => {
    const generator = generatorWith(await slowClaude(0.3))

    const first = generator.generate('/repos/a', { subject: 'first', description: '' })
    const second = generator.generate('/repos/a', { subject: 'second', description: '' })

    await expect(first).rejects.toMatchObject({ code: 'GENERATE_CANCELLED' })
    await expect(second).resolves.toMatchObject({ subject: 'second' })
  })

  it('leaves other repositories’ runs alone', async () => {
    const generator = generatorWith(await slowClaude(0.3))

    const a = generator.generate('/repos/a', { subject: 'for a', description: '' })
    const b = generator.generate('/repos/b', { subject: 'for b', description: '' })
    generator.cancel('/repos/a')

    await expect(a).rejects.toMatchObject({ code: 'GENERATE_CANCELLED' })
    await expect(b).resolves.toMatchObject({ subject: 'for b' })
  })

  it('does nothing when told to stop a repository with no run', () => {
    const generator = generatorWith('/nowhere/claude')

    expect(() => generator.cancel('/repos/a')).not.toThrow()
  })
})

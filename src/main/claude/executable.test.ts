import { describe, expect, it } from 'vitest'
import { ClaudeError } from './errors'
import { locateClaude, type LocateClaudeDeps } from './executable'

const HOME = '/Users/someone'

/** A fake machine: `installed` paths are executable; `shellAnswer` is what `command -v` prints. */
function fakeDeps(
  installed: string[],
  { shellAnswer = null, env = {} }: { shellAnswer?: string | null; env?: NodeJS.ProcessEnv } = {}
): LocateClaudeDeps {
  return {
    home: HOME,
    env,
    isExecutable: async (path) => installed.includes(path),
    askLoginShell: async () => {
      if (shellAnswer === null) throw new Error('not found')
      return shellAnswer
    }
  }
}

describe('locateClaude', () => {
  it('finds the native installer’s claude in ~/.local/bin, which an app from Finder has no PATH to', async () => {
    await expect(locateClaude(fakeDeps([`${HOME}/.local/bin/claude`]))).resolves.toBe(
      `${HOME}/.local/bin/claude`
    )
  })

  it('finds a Homebrew claude', async () => {
    await expect(locateClaude(fakeDeps(['/opt/homebrew/bin/claude']))).resolves.toBe(
      '/opt/homebrew/bin/claude'
    )
  })

  it('falls back to asking the login shell, for an install somewhere unusual', async () => {
    const deps = fakeDeps(['/somewhere/odd/claude'], { shellAnswer: '/somewhere/odd/claude\n' })

    await expect(locateClaude(deps)).resolves.toBe('/somewhere/odd/claude')
  })

  it('ignores a login-shell answer that is not an executable path, like an alias', async () => {
    const deps = fakeDeps([], { shellAnswer: 'alias claude=…\n' })

    await expect(locateClaude(deps)).rejects.toMatchObject({ code: 'CLAUDE_NOT_FOUND' })
  })

  it('fails with CLAUDE_NOT_FOUND when Claude Code is not installed', async () => {
    const error = await locateClaude(fakeDeps([])).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ClaudeError)
    expect(error).toMatchObject({ code: 'CLAUDE_NOT_FOUND' })
  })

  it('tries BRANCHES_CLAUDE_PATH first', async () => {
    const deps = fakeDeps(['/custom/claude', `${HOME}/.local/bin/claude`], {
      env: { BRANCHES_CLAUDE_PATH: '/custom/claude' }
    })

    await expect(locateClaude(deps)).resolves.toBe('/custom/claude')
  })
})

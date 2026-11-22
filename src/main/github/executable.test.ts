import { describe, expect, it } from 'vitest'
import { GitHubError } from './errors'
import { locateGh, type LocateGhDeps } from './executable'

const HOME = '/Users/someone'

/** A fake machine: `installed` paths are executable; `shellAnswer` is what `command -v` prints. */
function fakeDeps(
  installed: string[],
  { shellAnswer = null, env = {} }: { shellAnswer?: string | null; env?: NodeJS.ProcessEnv } = {}
): LocateGhDeps {
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

describe('locateGh', () => {
  it('finds a Homebrew gh on Apple silicon, which an app from Finder has no PATH to', async () => {
    await expect(locateGh(fakeDeps(['/opt/homebrew/bin/gh']))).resolves.toBe('/opt/homebrew/bin/gh')
  })

  it('finds gh in /usr/local/bin, where Intel Homebrew and the installer put it', async () => {
    await expect(locateGh(fakeDeps(['/usr/local/bin/gh']))).resolves.toBe('/usr/local/bin/gh')
  })

  it('falls back to asking the login shell, for an install somewhere unusual', async () => {
    const deps = fakeDeps(['/somewhere/odd/gh'], { shellAnswer: 'motd noise\n/somewhere/odd/gh\n' })

    await expect(locateGh(deps)).resolves.toBe('/somewhere/odd/gh')
  })

  it('ignores a login-shell answer that is not an absolute path, like an alias', async () => {
    const deps = fakeDeps(['gh'], { shellAnswer: 'gh\n' })

    await expect(locateGh(deps)).rejects.toMatchObject({ code: 'GH_NOT_FOUND' })
  })

  it('ignores a login-shell path that is not executable', async () => {
    const deps = fakeDeps([], { shellAnswer: '/somewhere/odd/gh\n' })

    await expect(locateGh(deps)).rejects.toMatchObject({ code: 'GH_NOT_FOUND' })
  })

  it('fails with GH_NOT_FOUND when gh is not installed', async () => {
    const error = await locateGh(fakeDeps([])).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ code: 'GH_NOT_FOUND' })
  })

  it('tries BRANCHES_GH_PATH first', async () => {
    const deps = fakeDeps(['/custom/gh', '/opt/homebrew/bin/gh'], {
      env: { BRANCHES_GH_PATH: '/custom/gh' }
    })

    await expect(locateGh(deps)).resolves.toBe('/custom/gh')
  })

  it('ignores a relative BRANCHES_GH_PATH', async () => {
    const deps = fakeDeps(['gh', '/opt/homebrew/bin/gh'], { env: { BRANCHES_GH_PATH: 'gh' } })

    await expect(locateGh(deps)).resolves.toBe('/opt/homebrew/bin/gh')
  })
})

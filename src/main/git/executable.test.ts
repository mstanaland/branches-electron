import { describe, expect, it } from 'vitest'
import { GitError } from './errors'
import {
  createGitExecutableResolver,
  getGitExecutable,
  locateGit,
  type GitExecutable,
  type LocateDeps
} from './executable'

/** A fake machine: `installed` maps a path to the output of `<path> --version`, or null if it can't run. */
function fakeDeps(
  installed: Record<string, string | null>,
  env: NodeJS.ProcessEnv = {}
): LocateDeps & { probed: string[] } {
  const probed: string[] = []
  return {
    env,
    probed,
    isExecutable: async (path) => path in installed,
    runVersion: async (path) => {
      probed.push(path)
      const output = installed[path]
      if (output === null || output === undefined) throw new Error(`${path} failed to run`)
      return output
    }
  }
}

describe('locateGit', () => {
  it('uses a user-installed git and reports its version', async () => {
    const deps = fakeDeps({ '/opt/homebrew/bin/git': 'git version 2.43.0\n' })

    await expect(locateGit(deps)).resolves.toEqual({
      path: '/opt/homebrew/bin/git',
      version: '2.43.0'
    })
  })

  it('prefers user-installed git over Apple’s', async () => {
    const deps = fakeDeps({
      '/usr/bin/git': 'git version 2.39.5 (Apple Git-154)\n',
      '/usr/local/bin/git': 'git version 2.44.0\n'
    })

    expect((await locateGit(deps)).path).toBe('/usr/local/bin/git')
  })

  it('skips a candidate that is not installed', async () => {
    const deps = fakeDeps({ '/usr/bin/git': 'git version 2.39.5 (Apple Git-154)\n' })

    await expect(locateGit(deps)).resolves.toEqual({ path: '/usr/bin/git', version: '2.39.5' })
  })

  it('skips a candidate that exists but fails to run', async () => {
    const deps = fakeDeps({
      '/opt/homebrew/bin/git': null,
      '/usr/bin/git': 'git version 2.39.5 (Apple Git-154)\n'
    })

    expect((await locateGit(deps)).path).toBe('/usr/bin/git')
  })

  it('skips a candidate whose --version output is not a git version', async () => {
    const deps = fakeDeps({
      '/opt/homebrew/bin/git': 'hello from some other program\n',
      '/usr/bin/git': 'git version 2.39.5 (Apple Git-154)\n'
    })

    await expect(locateGit(deps)).resolves.toEqual({ path: '/usr/bin/git', version: '2.39.5' })
  })

  it('uses BRANCHES_GIT_PATH ahead of every fixed location', async () => {
    const deps = fakeDeps(
      {
        '/Users/me/.local/share/mise/shims/git': 'git version 2.45.1\n',
        '/opt/homebrew/bin/git': 'git version 2.43.0\n'
      },
      { BRANCHES_GIT_PATH: '/Users/me/.local/share/mise/shims/git' }
    )

    await expect(locateGit(deps)).resolves.toEqual({
      path: '/Users/me/.local/share/mise/shims/git',
      version: '2.45.1'
    })
  })

  it('falls back to the fixed locations when BRANCHES_GIT_PATH does not work', async () => {
    const deps = fakeDeps(
      { '/opt/homebrew/bin/git': 'git version 2.43.0\n' },
      { BRANCHES_GIT_PATH: '/typo/git' }
    )

    expect((await locateGit(deps)).path).toBe('/opt/homebrew/bin/git')
  })

  it('throws GIT_NOT_FOUND when no candidate works', async () => {
    const deps = fakeDeps({ '/usr/bin/git': null })

    await expect(locateGit(deps)).rejects.toMatchObject({
      name: 'GitError',
      code: 'GIT_NOT_FOUND'
    })
    await expect(locateGit(deps)).rejects.toBeInstanceOf(GitError)
  })
})

describe('createGitExecutableResolver', () => {
  const found: GitExecutable = { path: '/opt/homebrew/bin/git', version: '2.43.0' }

  it('locates git once, even for concurrent callers', async () => {
    let calls = 0
    const resolve = createGitExecutableResolver(async () => {
      calls += 1
      return found
    })

    const results = await Promise.all([resolve(), resolve(), resolve()])
    await resolve()

    expect(results).toEqual([found, found, found])
    expect(calls).toBe(1)
  })

  it('does not cache a failure, so installing git later works without a restart', async () => {
    let installed = false
    const resolve = createGitExecutableResolver(async () => {
      if (!installed) throw new GitError('GIT_NOT_FOUND', 'git was not found on this computer.')
      return found
    })

    await expect(resolve()).rejects.toMatchObject({ code: 'GIT_NOT_FOUND' })
    installed = true

    await expect(resolve()).resolves.toEqual(found)
  })
})

describe('getGitExecutable', () => {
  // Runs the real filesystem check and `git --version`; the git-layer tests need git installed anyway.
  it('finds a working git on this machine', async () => {
    const git = await getGitExecutable()

    expect(git.path).toMatch(/\/git$/)
    expect(git.version).toMatch(/^\d+\.\d+/)
  })
})

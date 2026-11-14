import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { GitError } from './errors'

export interface GitExecutable {
  path: string
  /** Numeric version, e.g. "2.43.0". */
  version: string
}

export interface LocateDeps {
  env: NodeJS.ProcessEnv
  isExecutable(path: string): Promise<boolean>
  /** Runs `<path> --version` and resolves with its stdout. Rejects if it can't run. */
  runVersion(path: string): Promise<string>
}

const CANDIDATES = ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']

export async function locateGit(deps: LocateDeps): Promise<GitExecutable> {
  const override = deps.env.BRANCHES_GIT_PATH
  const candidates = override ? [override, ...CANDIDATES] : CANDIDATES
  for (const path of candidates) {
    if (!(await deps.isExecutable(path))) continue
    try {
      const version = /git version (\d+(?:\.\d+)+)/.exec(await deps.runVersion(path))?.[1]
      if (version) return { path, version }
    } catch {
      // Exists but can't run, like the Command Line Tools shim without the tools installed.
    }
  }
  throw new GitError('GIT_NOT_FOUND', 'git was not found on this computer.')
}

/** Wraps `locate` so it runs once. A failure is not remembered, so the next call tries again. */
export function createGitExecutableResolver(
  locate: () => Promise<GitExecutable>
): () => Promise<GitExecutable> {
  let cached: Promise<GitExecutable> | undefined
  return () => {
    if (!cached) {
      const attempt = locate()
      cached = attempt
      attempt.catch(() => {
        if (cached === attempt) cached = undefined
      })
    }
    return cached
  }
}

const realDeps: LocateDeps = {
  env: process.env,
  isExecutable: (path) =>
    access(path, constants.X_OK).then(
      () => true,
      () => false
    ),
  // Not via runGit: no repository is involved, so `-C` and `--no-optional-locks` don't apply.
  runVersion: (path) =>
    new Promise((resolve, reject) => {
      // A short timeout: the Command Line Tools shim can pop up an installer prompt.
      execFile(path, ['--version'], { encoding: 'utf8', timeout: 5000 }, (error, stdout) =>
        error ? reject(error) : resolve(stdout)
      )
    })
}

/** The git binary this app runs, found once and shared. */
export const getGitExecutable = createGitExecutableResolver(() => locateGit(realDeps))

import { execFile } from 'node:child_process'
import { GitError } from './errors'
import { getGitExecutable } from './executable'

const MAX_BUFFER = 64 * 1024 * 1024

export interface GitResult {
  stdout: string
  stderr: string
  /** True when `maxOutput` was reached and stdout holds only the start of git's output. */
  truncated: boolean
}

export interface RunGitOptions {
  /** Exit codes that mean success, e.g. 1 for `git diff --no-index` when the files differ. */
  okExitCodes?: readonly number[]
  /** Stop git once it has written this many bytes, and return what came first, truncated. */
  maxOutput?: number
}

/**
 * Runs `git -C <root> --no-optional-locks --literal-pathspecs <args...>` without a shell.
 *
 * `--no-optional-locks` keeps read commands like `status` from taking
 * `.git/index.lock`, so this app never blocks the user's other git tools.
 *
 * `--literal-pathspecs` makes a file named `*.txt` or `[a].md` match only itself, never
 * other files or pathspec magic like `:(exclude)`.
 *
 * Rejects with a GitError on a non-zero exit, or GIT_NOT_FOUND if no git binary can be located.
 */
export async function runGit(
  root: string,
  args: readonly string[],
  options: RunGitOptions = {}
): Promise<GitResult> {
  const fullArgs = ['-C', root, '--no-optional-locks', '--literal-pathspecs', ...args]
  const git = await getGitExecutable()

  return new Promise((resolve, reject) => {
    execFile(
      git.path,
      fullArgs,
      {
        encoding: 'utf8',
        maxBuffer: options.maxOutput ?? MAX_BUFFER,
        env: {
          ...process.env,
          // Never block waiting for a credential prompt nobody can see.
          GIT_TERMINAL_PROMPT: '0',
          // Keep git's messages in English so stderr checks are stable.
          LC_ALL: 'C'
        }
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, truncated: false })
          return
        }
        if (options.maxOutput !== undefined && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          // git was stopped at the limit; what it wrote before that is still good.
          resolve({ stdout, stderr, truncated: true })
          return
        }
        const exitCode = typeof error.code === 'number' ? error.code : null
        if (exitCode !== null && options.okExitCodes?.includes(exitCode)) {
          resolve({ stdout, stderr, truncated: false })
          return
        }
        reject(
          new GitError('COMMAND_FAILED', `git ${args[0] ?? ''} failed: ${stderr.trim()}`, {
            args,
            exitCode,
            stderr
          })
        )
      }
    )
  })
}

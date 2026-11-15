import { execFile } from 'node:child_process'
import { GitError } from './errors'
import { getGitExecutable } from './executable'

const MAX_BUFFER = 64 * 1024 * 1024

export interface GitResult {
  stdout: string
  stderr: string
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
export async function runGit(root: string, args: readonly string[]): Promise<GitResult> {
  const fullArgs = ['-C', root, '--no-optional-locks', '--literal-pathspecs', ...args]
  const git = await getGitExecutable()

  return new Promise((resolve, reject) => {
    execFile(
      git.path,
      fullArgs,
      {
        encoding: 'utf8',
        maxBuffer: MAX_BUFFER,
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
          resolve({ stdout, stderr })
          return
        }
        const exitCode = typeof error.code === 'number' ? error.code : null
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

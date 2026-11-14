import { execFile } from 'node:child_process'
import { GitError } from './errors'

const MAX_BUFFER = 64 * 1024 * 1024

export interface GitResult {
  stdout: string
  stderr: string
}

/**
 * Runs `git -C <root> --no-optional-locks <args...>` without a shell.
 *
 * `--no-optional-locks` keeps read commands like `status` from taking
 * `.git/index.lock`, so this app never blocks the user's other git tools.
 * Rejects with a GitError on a non-zero exit.
 */
export function runGit(root: string, args: readonly string[]): Promise<GitResult> {
  const fullArgs = ['-C', root, '--no-optional-locks', ...args]

  return new Promise((resolve, reject) => {
    execFile(
      'git',
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
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new GitError('GIT_NOT_FOUND', 'git was not found on this computer.', { args }))
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

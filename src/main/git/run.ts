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
  /**
   * Written to git's stdin, which is then closed. Use it for anything that would otherwise
   * be an argument git might log, truncate or mis-read — a commit message, for instance,
   * which `-F -` reads from here verbatim.
   */
  input?: string
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
    const child = execFile(
      git.path,
      fullArgs,
      {
        encoding: 'utf8',
        maxBuffer: options.maxOutput ?? MAX_BUFFER,
        env: {
          ...process.env,
          // Never block waiting for a credential prompt nobody can see. Between them these
          // turn a repository that wants credentials — a background fetch over https or ssh —
          // into a fast failure rather than a child process waiting on a terminal that
          // isn't there. `echo` answers every prompt with nothing, which git treats as a
          // refused credential.
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
          SSH_ASKPASS: 'echo',
          // `never` stops ssh reaching for a graphical passphrase prompt. GIT_SSH_COMMAND is
          // deliberately left alone: setting it here would override a repository's
          // `core.sshCommand`, and with it the identity or proxy the remote needs.
          SSH_ASKPASS_REQUIRE: 'never',
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
          new GitError(
            'COMMAND_FAILED',
            // Hooks and git itself both report on stdout at times (a rejected `pre-commit`,
            // "nothing to commit"), so fall back to it rather than failing with no reason.
            `git ${args[0] ?? ''} failed: ${stderr.trim() || stdout.trim()}`,
            { args, exitCode, stderr, stdout }
          )
        )
      }
    )

    // git can exit before reading stdin (most commands never read it), and writing to a pipe
    // nobody is reading fails with EPIPE. Unhandled, that would crash the process; the exit is
    // what reports how git did, so this is safe to ignore.
    child.stdin?.on('error', () => {})
    // Always closed, so a command that reads stdin (`commit -F -`) never waits forever.
    child.stdin?.end(options.input ?? '')
  })
}

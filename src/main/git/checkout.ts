import { GitError } from './errors'
import { enqueueWrite } from './queue'
import { runGit } from './run'

/**
 * An exception to "don't parse human-formatted output": git reports this failure only as
 * text, and runGit pins LC_ALL=C so the wording is stable.
 *
 * The files git names after "would be overwritten by checkout:". They come tab-indented, one
 * per line, in both the local-changes and the untracked-files variants of the message.
 */
export function parseBlockingFiles(stderr: string): string[] | null {
  const lines = stderr.split('\n')
  const header = lines.findIndex((line) => /would be overwritten by (checkout|merge)/.test(line))
  if (header === -1) return null

  const files: string[] = []
  for (const line of lines.slice(header + 1)) {
    if (!line.startsWith('\t')) break
    files.push(line.slice(1))
  }
  return files
}

/**
 * Switches to an existing local branch with `git switch`. Runs in the repository's write queue.
 *
 * Fails with CHECKOUT_BLOCKED_BY_CHANGES, carrying `files`, when local changes or untracked
 * files would be overwritten; any other failure is COMMAND_FAILED.
 */
export function checkoutBranch(root: string, name: string): Promise<void> {
  // A name like "--detach" would be read as an option, and git switch has no "--" for it.
  if (name.startsWith('-')) {
    return Promise.reject(
      new GitError('COMMAND_FAILED', `“${name}” is not a branch name.`, { args: ['switch', name] })
    )
  }

  return enqueueWrite(root, async () => {
    try {
      // --no-guess: only ever switch to a branch that exists, never create one from a remote.
      await runGit(root, ['switch', '--no-guess', name])
    } catch (error) {
      if (error instanceof GitError && error.code === 'COMMAND_FAILED') {
        const files = parseBlockingFiles(error.stderr)
        if (files !== null) {
          throw new GitError(
            'CHECKOUT_BLOCKED_BY_CHANGES',
            `Can’t switch to ${name}: local changes would be overwritten.`,
            { args: error.args, exitCode: error.exitCode, stderr: error.stderr, files }
          )
        }
      }
      throw error
    }
  })
}

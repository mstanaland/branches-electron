import { runGit } from './run'

/** Past this much staged diff, **Generate** gets the start of it and a note that it was cut. */
export const MAX_CONTEXT_DIFF_BYTES = 100 * 1024

/** How many recent commit subjects **Generate** is shown as examples of the repository's style. */
const RECENT_SUBJECTS = 10

/** What **Generate** is told about the commit it writes a message for. */
export interface CommitContext {
  /** The staged diff — exactly what a commit would record — cut short if `truncated`. */
  stagedDiff: string
  truncated: boolean
  /** The subjects of the newest commits on HEAD, newest first. Empty with no commits. */
  recentSubjects: string[]
}

/**
 * Reads what **Generate** needs: the staged diff and the latest commit subjects. Both are
 * reads, so this runs outside the write queue, like every other read.
 *
 * Unstaged and untracked work is deliberately left out: the message describes what Commit
 * will record, and nothing else.
 */
export async function readCommitContext(
  root: string,
  { maxDiffBytes = MAX_CONTEXT_DIFF_BYTES }: { maxDiffBytes?: number } = {}
): Promise<CommitContext> {
  const [diff, recentSubjects] = await Promise.all([
    // `--cached` compares against the empty tree when there are no commits, so a first
    // commit reads as all additions rather than failing. `--no-ext-diff` keeps a configured
    // diff tool from replacing git's own patch format.
    runGit(root, ['diff', '--cached', '-M', '--no-color', '--no-ext-diff'], {
      maxOutput: maxDiffBytes
    }),
    readRecentSubjects(root)
  ])
  return { stagedDiff: diff.stdout, truncated: diff.truncated, recentSubjects }
}

async function readRecentSubjects(root: string): Promise<string[]> {
  try {
    const { stdout } = await runGit(root, [
      'log',
      `--max-count=${RECENT_SUBJECTS}`,
      '-z',
      '--format=%s',
      'HEAD',
      '--'
    ])
    return stdout.split('\0').filter((subject) => subject !== '')
  } catch {
    // An unborn HEAD — a repository with no commits — has no history to learn from.
    return []
  }
}

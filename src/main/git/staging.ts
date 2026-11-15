import { enqueueWrite } from './queue'
import { runGit } from './run'

/**
 * Stages whole changes with `git add`: a modification, a new file or a deletion, whichever
 * each path is. Runs in the repository's write queue. Staging nothing is a no-op, so an
 * empty selection never reaches git (where no pathspec would mean "everything").
 */
export function stageFiles(root: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return Promise.resolve()
  return enqueueWrite(root, async () => {
    // `--` keeps a path like "-f" or "--cached" from being read as an option.
    await runGit(root, ['add', '--', ...paths])
  })
}

/**
 * Takes whole changes back out of the index, leaving the work tree untouched.
 *
 * `git restore --staged` restores the index from HEAD, so it needs a HEAD. A repository with
 * no commits has none, and there nothing in the index was ever committed: removing the entry
 * outright is the same thing, and leaves the file as untracked. `--cached` never touches the
 * file on disk, so forcing it is safe; without `-f` git refuses a path whose staged content
 * differs from both HEAD and the file, which is exactly a partially staged change.
 */
export function unstageFiles(root: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return Promise.resolve()
  return enqueueWrite(root, async () => {
    if (await hasCommits(root)) {
      await runGit(root, ['restore', '--staged', '--', ...paths])
    } else {
      await runGit(root, ['rm', '--cached', '--force', '--quiet', '--', ...paths])
    }
  })
}

/** False in a repository with no commits, where HEAD points at an unborn branch. */
async function hasCommits(root: string): Promise<boolean> {
  // rev-parse exits 1 with no output when HEAD cannot be resolved.
  const { stdout } = await runGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    okExitCodes: [1]
  })
  return stdout.trim() !== ''
}

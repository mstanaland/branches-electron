import { enqueueWrite } from './queue'
import { runGit } from './run'

/**
 * Commits what is in the index. Runs in the repository's write queue, so it never races
 * another write for `.git/index.lock`.
 *
 * The message goes in on stdin via `-F -` rather than `-m`: a multi-line message, a `#`,
 * a backtick or a leading dash all reach git exactly as the user typed them, and the message
 * never has to survive being an argument.
 *
 * Hooks run as usual. When `pre-commit` or `commit-msg` rejects the commit, or signing fails,
 * the `GitError` carries what git and the hook printed — stdout included, since hooks commonly
 * report there — so the form can show the user what to fix.
 */
export function commit(root: string, message: string): Promise<void> {
  return enqueueWrite(root, async () => {
    await runGit(root, ['commit', '-F', '-'], { input: message })
  })
}

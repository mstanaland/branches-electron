import type { CommitDetails } from '../../shared/git'
import { GitError } from './errors'
import { runGit } from './run'

/**
 * The fields of one commit, NUL-separated. `%b` is last because it is the only one that can
 * hold newlines; no field can hold a NUL, so splitting on it is unambiguous.
 *
 * `%b` rather than slicing `%B` after its first line: it is git's own split, the same one
 * that gives the history list its `%s`, so the subject shown above and the description shown
 * below never overlap or leave a line out.
 */
const FIELDS = ['%H', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%b']

/** Everything **commit details** shows about `oid` beyond its row in the history. */
export async function getCommitDetails(root: string, oid: string): Promise<CommitDetails> {
  const args = [
    'show',
    '--no-patch',
    // A `log.showSignature` setting would otherwise print GPG's verdict ahead of the fields.
    '--no-show-signature',
    `--format=${FIELDS.join('%x00')}`,
    // Peeled to a commit, so a blob or tree oid fails rather than printing its contents.
    `${oid}^{commit}`,
    // Nothing after this can be read as a path.
    '--'
  ]
  const { stdout } = await runGit(root, args)
  return parseCommitDetails(stdout, args)
}

/** Parses the NUL-separated fields from `getCommitDetails`. */
export function parseCommitDetails(output: string, args: readonly string[] = []): CommitDetails {
  const fields = output.split('\0')
  if (fields.length < FIELDS.length) {
    throw new GitError('COMMAND_FAILED', 'git show printed something other than a commit.', {
      args,
      stdout: output
    })
  }
  const [
    oid,
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    ...rest
  ] = fields
  return {
    oid,
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    // git ends the format with a newline, and a body usually ends with one of its own.
    description: rest.join('\0').trimEnd()
  }
}

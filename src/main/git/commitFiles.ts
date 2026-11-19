import type { CommitFile, CommitFileKind, FileDiff } from '../../shared/git'
import { MAX_DIFF_OUTPUT, parseDiff } from './diff'
import { GitError } from './errors'
import { runGit } from './run'

/**
 * What every commit diff here compares, and how:
 *
 * - `--root` diffs a root commit against the empty tree, so each of its files is added.
 * - `--diff-merges=first-parent` diffs a merge against its first parent only: what the merge
 *   brought to the line it landed on.
 * - `-M` detects renames and nothing else. `diff-tree` is plumbing, so neither `diff.renames`
 *   nor any other diff setting in the user's config can turn on copy detection or change the
 *   output.
 */
const COMMIT_DIFF = ['--no-commit-id', '--root', '--diff-merges=first-parent', '-M']

const KINDS: Record<string, CommitFileKind> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  T: 'typeChanged'
}

/**
 * The files `oid` changed, in git's (path) order. A commit that changed nothing — an empty
 * commit, or a merge identical to its first parent — gives an empty list.
 */
export async function listCommitFiles(root: string, oid: string): Promise<CommitFile[]> {
  const args = [
    'diff-tree',
    '-r',
    '-z',
    '--name-status',
    ...COMMIT_DIFF,
    // Peeled to a commit, so a blob or tree oid fails rather than diffing something else.
    `${oid}^{commit}`,
    '--'
  ]
  const { stdout } = await runGit(root, args)
  return parseCommitFiles(stdout, args)
}

/**
 * Parses `diff-tree -z --name-status`: a status field, then one path, or two for a rename
 * (from, then to), each NUL-terminated.
 */
export function parseCommitFiles(output: string, args: readonly string[] = []): CommitFile[] {
  const fields = output.split('\0')
  const files: CommitFile[] = []
  let index = 0
  while (index < fields.length && fields[index] !== '') {
    const status = fields[index++]
    // A rename's status carries its similarity score, like "R087".
    const kind = KINDS[status[0]]
    if (kind === undefined) {
      throw new GitError('COMMAND_FAILED', `git diff-tree printed an unknown status: ${status}`, {
        args,
        stdout: output
      })
    }
    if (kind === 'renamed') {
      const originalPath = fields[index++]
      files.push({ kind, path: fields[index++], originalPath })
    } else {
      files.push({ kind, path: fields[index++], originalPath: null })
    }
  }
  return files
}

/**
 * The diff of one file `oid` changed, compared the way `listCommitFiles` compares it. For a
 * rename, pass the `originalPath` it gave, so the diff is the rename's edits rather than the
 * whole file added. Cut short, and marked `truncated`, past the same size as a working diff.
 */
export async function getCommitFileDiff(
  root: string,
  oid: string,
  path: string,
  originalPath: string | null
): Promise<FileDiff> {
  const { stdout, truncated } = await runGit(
    root,
    [
      'diff-tree',
      '-p',
      // --no-ext-diff and --no-textconv keep repository config from running other programs.
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      ...COMMIT_DIFF,
      `${oid}^{commit}`,
      '--',
      ...(originalPath === null ? [] : [originalPath]),
      path
    ],
    { maxOutput: MAX_DIFF_OUTPUT }
  )
  return parseDiff(stdout, truncated)
}

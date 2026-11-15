import type { ChangeDiff, DiffHunk, DiffLine, FileDiff } from '../../shared/git'
import { runGit } from './run'

/** Diffs bigger than this many bytes are cut short; the rest would only slow the UI down. */
const MAX_DIFF_OUTPUT = 1024 * 1024

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Parses the output of `git diff` for a single file into hunks and lines.
 *
 * Lines are read by the counts in each `@@` header rather than by their first character, so a
 * removed line whose text starts with "-- " is not mistaken for a file header. Anything before
 * the first hunk (the `diff --git`, `index`, `rename from` lines) is skipped, except the
 * "Binary files … differ" line, which makes the whole diff `{ binary: true }`.
 *
 * With `truncated`, the output was cut off at a byte limit, so a last line that has no newline
 * after it may be only part of a line and is dropped.
 */
export function parseDiff(output: string, truncated = false): FileDiff {
  const complete = truncated ? output.slice(0, output.lastIndexOf('\n') + 1) : output
  const hunks: DiffHunk[] = []
  let lines: DiffLine[] = []
  let oldLeft = 0
  let newLeft = 0
  let oldNumber = 0
  let newNumber = 0

  for (const line of complete.split('\n')) {
    if (line.startsWith('\\')) {
      // "\ No newline at end of file" belongs to the line before it.
      const previous = lines.at(-1)
      if (previous) previous.noNewline = true
      continue
    }

    if (oldLeft > 0 || newLeft > 0) {
      const text = line.slice(1)
      if (line.startsWith('+') && newLeft > 0) {
        lines.push({
          kind: 'added',
          oldNumber: null,
          newNumber: newNumber++,
          text,
          noNewline: false
        })
        newLeft--
        continue
      }
      if (line.startsWith('-') && oldLeft > 0) {
        lines.push({
          kind: 'removed',
          oldNumber: oldNumber++,
          newNumber: null,
          text,
          noNewline: false
        })
        oldLeft--
        continue
      }
      if (line.startsWith(' ') && oldLeft > 0 && newLeft > 0) {
        lines.push({
          kind: 'context',
          oldNumber: oldNumber++,
          newNumber: newNumber++,
          text,
          noNewline: false
        })
        oldLeft--
        newLeft--
        continue
      }
      // Not what the header promised (a cut-off diff): treat the hunk as over.
      oldLeft = 0
      newLeft = 0
    }

    const header = HUNK_HEADER.exec(line)
    if (header) {
      oldNumber = Number(header[1])
      oldLeft = header[2] === undefined ? 1 : Number(header[2])
      newNumber = Number(header[3])
      newLeft = header[4] === undefined ? 1 : Number(header[4])
      lines = []
      hunks.push({ header: line, lines })
    } else if (hunks.length === 0 && line.startsWith('Binary files ') && line.endsWith(' differ')) {
      return { binary: true }
    }
  }

  return { binary: false, hunks, truncated }
}

/** Runs `git diff` with the flags every diff here needs; null when there is nothing to show. */
async function diffOf(
  root: string,
  args: readonly string[],
  okExitCodes?: readonly number[]
): Promise<FileDiff | null> {
  // --no-ext-diff and --no-textconv keep repository config from running other programs.
  const { stdout, truncated } = await runGit(
    root,
    ['diff', '--no-color', '--no-ext-diff', '--no-textconv', ...args],
    { maxOutput: MAX_DIFF_OUTPUT, okExitCodes }
  )
  return stdout === '' ? null : parseDiff(stdout, truncated)
}

/**
 * The diff of one change, split by side. `staged` compares the index with HEAD, `unstaged`
 * the work tree with the index. For a renamed file, pass `originalPath` so the staged side
 * shows one rename instead of an added file. An untracked file has only an `unstaged` diff,
 * against nothing.
 *
 * A tracked file with no differences gives `{ staged: null, unstaged: null }`.
 */
export async function getDiff(
  root: string,
  path: string,
  originalPath: string | null = null
): Promise<ChangeDiff> {
  const [staged, unstaged] = await Promise.all([
    diffOf(root, ['--cached', '-M', '--', ...(originalPath === null ? [] : [originalPath]), path]),
    diffOf(root, ['--', path])
  ])
  if (staged !== null || unstaged !== null) return { staged, unstaged }

  // Nothing differs from the index. If git doesn't know the file at all, it's untracked.
  const { stdout: tracked } = await runGit(root, ['ls-files', '-z', '--cached', '--', path])
  if (tracked !== '') return { staged: null, unstaged: null }

  // --no-index exits 1 when the files differ, which is what we want here.
  return {
    staged: null,
    unstaged: await diffOf(root, ['--no-index', '--', '/dev/null', path], [1])
  }
}

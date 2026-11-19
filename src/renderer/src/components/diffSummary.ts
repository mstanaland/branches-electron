import type { FileDiff } from '../../../shared/git'

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * One line about a file's diff, counted from its hunks: "3 hunks, 230 insertions, 1 deletion".
 * A truncated diff says so rather than giving counts of the part that was read. Null when there
 * are no hunks to count — a binary file or a change to the mode or name only — since those
 * show their own notice.
 */
export function diffSummary(diff: FileDiff): string | null {
  if (diff.binary || diff.hunks.length === 0) return null
  if (diff.truncated) return 'Diff truncated: too large to count in full'

  let insertions = 0
  let deletions = 0
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'added') insertions++
      else if (line.kind === 'removed') deletions++
    }
  }
  return [
    count(diff.hunks.length, 'hunk', 'hunks'),
    count(insertions, 'insertion', 'insertions'),
    count(deletions, 'deletion', 'deletions')
  ].join(', ')
}

import type { DiffHunk, DiffLine, FileDiff } from '../../../shared/git'
import { EmptyState } from '../ui'
import styles from './FileDiffView.module.css'

const SIGNS = { context: ' ', added: '+', removed: '-' } as const

/**
 * One side of a change as a table: an old and a new line-number gutter, a +/- column, and the
 * line. Binary files, truncated diffs and contents-free changes get a message instead or as well.
 */
export function FileDiffView({
  diff,
  label
}: {
  diff: FileDiff
  /** Names the table for screen readers, e.g. "Staged changes". */
  label: string
}): React.JSX.Element {
  if (diff.binary) {
    return <EmptyState title="Binary file" detail="A diff can’t be shown for a binary file." />
  }
  if (diff.hunks.length === 0) {
    return (
      <EmptyState
        title="No changes to the contents"
        detail="Only the file’s name or mode changed."
      />
    )
  }

  return (
    <>
      <div className={styles.scroller}>
        <table className={styles.diff} aria-label={label}>
          <tbody>
            {diff.hunks.map((hunk, hunkIndex) => (
              // Hunks and lines never reorder, so their positions are stable keys.
              <HunkRows key={hunkIndex} hunk={hunk} />
            ))}
          </tbody>
        </table>
      </div>
      {diff.truncated && (
        <EmptyState
          title="Diff too large to show in full"
          detail="Only the first part of it is shown."
        />
      )}
    </>
  )
}

function HunkRows({ hunk }: { hunk: DiffHunk }): React.JSX.Element {
  return (
    <>
      <tr className={styles.hunk}>
        <td colSpan={4}>{hunk.header}</td>
      </tr>
      {hunk.lines.map((line, lineIndex) => (
        <LineRows key={lineIndex} line={line} />
      ))}
    </>
  )
}

function LineRows({ line }: { line: DiffLine }): React.JSX.Element {
  return (
    <>
      <tr className={styles.line} data-kind={line.kind}>
        <td className={styles.gutter}>{line.oldNumber}</td>
        <td className={styles.gutter}>{line.newNumber}</td>
        <td className={styles.sign}>{SIGNS[line.kind]}</td>
        <td className={styles.code}>{line.text}</td>
      </tr>
      {line.noNewline && (
        <tr className={styles.line} data-marker="no-newline">
          <td className={styles.gutter} />
          <td className={styles.gutter} />
          <td className={styles.sign} />
          <td className={`${styles.code} ${styles.marker}`}>No newline at end of file</td>
        </tr>
      )}
    </>
  )
}

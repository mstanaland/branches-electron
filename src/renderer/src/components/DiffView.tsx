import { ArrowRight } from 'lucide-react'
import type { ChangeDiff, FileChange } from '../../../shared/git'
import { describeError, useDiff, useSelection, useStatus } from '../data'
import { EmptyState } from '../ui'
import { FileDiffView } from './FileDiffView'
import shared from './shared.module.css'
import styles from './DiffView.module.css'

/** The path of the change, `old → new` for a rename. */
function ChangeTitle({ change }: { change: FileChange }): React.JSX.Element {
  return (
    <h2 className={styles.title}>
      {change.originalPath !== null && (
        <>
          <span>{change.originalPath}</span>
          <ArrowRight role="img" aria-label="renamed to" className={styles.arrow} />
        </>
      )}
      <span>{change.path}</span>
    </h2>
  )
}

/**
 * The sides of a change that have a diff. They are stacked, staged first; whether to put them
 * in columns or tabs is undecided, so this is the one place that arranges them.
 */
function Sections({ diff }: { diff: ChangeDiff }): React.JSX.Element {
  const sides = [
    { name: 'Staged', diff: diff.staged },
    { name: 'Unstaged', diff: diff.unstaged }
  ]
  return (
    <div className={styles.sections}>
      {sides.map(
        (side) =>
          side.diff && (
            <section key={side.name} className={styles.section}>
              <h3 className={styles.sectionTitle}>{side.name}</h3>
              <FileDiffView diff={side.diff} label={`${side.name} changes`} />
            </section>
          )
      )}
    </div>
  )
}

/** The diff of the change selected in the changes list. */
export function DiffView({ root }: { root: string }): React.JSX.Element {
  const status = useStatus(root)
  const { selectedPath } = useSelection()

  const change = status.data?.changes.find(
    (candidate) => candidate.path === selectedPath && candidate.kind !== 'ignored'
  )
  const conflict = change?.kind === 'unmerged'
  // A conflict has no diff to ask for; its resolution happens outside this app.
  const diff = useDiff(root, change && !conflict ? change.path : null, change?.originalPath ?? null)
  const error = describeError(diff.error)

  if (change === undefined) {
    return (
      <div className={styles.pane}>
        <div className={styles.body}>
          <EmptyState title="Select a file to see its changes" />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pane}>
      <ChangeTitle change={change} />
      <div className={styles.body}>
        {conflict && <EmptyState title="Resolve this conflict in your editor" />}
        {error && (
          <p role="alert" className={shared.error}>
            {error.message}
          </p>
        )}
        {diff.data &&
          (diff.data.staged === null && diff.data.unstaged === null ? (
            <EmptyState title="No changes in this file" />
          ) : (
            <Sections diff={diff.data} />
          ))}
      </div>
    </div>
  )
}

import { ArrowRight, GitBranch } from 'lucide-react'
import { useMemo } from 'react'
import { changedSide, sortChanges, splitPath, stagingState } from '../../../shared/changes'
import type { FileChange } from '../../../shared/git'
import { describeError, useConfirmRemoveMissing, useSelection, useStatus } from '../data'
import { AheadBehind, Button, Checkbox, EmptyState } from '../ui'
import { StatusBadge } from './StatusBadge'
import shared from './shared.module.css'
import styles from './ChangedFiles.module.css'

/** The file name and its dimmed folder; a rename shows `old → new`. */
function ChangeName({ change }: { change: FileChange }): React.JSX.Element {
  const { folder, name } = splitPath(change.path)
  if (change.originalPath === null) {
    return (
      <span className={styles.path}>
        <span className={styles.name}>{name}</span>
        {folder && <span className={styles.folder}>{folder}</span>}
      </span>
    )
  }

  const from = splitPath(change.originalPath)
  const sameFolder = from.folder === folder
  return (
    <span className={styles.path}>
      <span className={styles.name}>{sameFolder ? from.name : change.originalPath}</span>
      <ArrowRight className={styles.arrow} aria-label="renamed to" role="img" />
      <span className={styles.name}>{sameFolder ? name : change.path}</span>
      {sameFolder && folder && <span className={styles.folder}>{folder}</span>}
    </span>
  )
}

function Badges({ change }: { change: FileChange }): React.JSX.Element {
  if (change.kind === 'unmerged') {
    return <StatusBadge status="unmerged" side="unstaged" />
  }
  if (change.kind === 'untracked') {
    return <StatusBadge status="untracked" side="unstaged" />
  }
  const staged = changedSide(change.index)
  const unstaged = changedSide(change.worktree)
  return (
    <>
      {staged && <StatusBadge status={staged} side="staged" />}
      {unstaged && <StatusBadge status={unstaged} side="unstaged" />}
    </>
  )
}

function ChangeRow({
  change,
  selected,
  onSelect
}: {
  change: FileChange
  selected: boolean
  onSelect: (path: string) => void
}): React.JSX.Element {
  const conflict = change.kind === 'unmerged'
  const state = stagingState(change)

  const content = (
    <>
      <span className={styles.badges}>
        <Badges change={change} />
      </span>
      <ChangeName change={change} />
    </>
  )

  return (
    <li className={styles.row} data-conflict={conflict ? 'true' : undefined}>
      <span className={styles.check}>
        {!conflict && (
          // Display only: the staging ticket wires this up.
          <Checkbox
            aria-label={`${change.path}: ${state === 'partial' ? 'partially staged' : state}`}
            checked={state === 'staged'}
            indeterminate={state === 'partial'}
            readOnly
          />
        )}
      </span>
      {conflict ? (
        <span className={styles.content}>{content}</span>
      ) : (
        <button
          type="button"
          className={styles.content}
          aria-pressed={selected}
          onClick={() => onSelect(change.path)}
        >
          {content}
        </button>
      )}
    </li>
  )
}

/** The main pane for the active repository: its branch and its changes as one flat list. */
export function ChangedFiles({ root }: { root: string }): React.JSX.Element | null {
  const status = useStatus(root)
  const confirmRemoval = useConfirmRemoveMissing()
  const { selectedPath, setSelectedPath } = useSelection()

  const data = status.data
  const changes = useMemo(() => (data ? sortChanges(data.changes) : []), [data])
  const error = describeError(status.error ?? confirmRemoval.error)

  if (error?.notARepository) {
    return (
      <div className={styles.pane}>
        <EmptyState
          title="Repository not found"
          detail="Its folder is gone or is no longer a repository."
          action={<Button onClick={() => confirmRemoval.mutate(root)}>Remove</Button>}
        />
      </div>
    )
  }

  return (
    <div className={styles.pane}>
      {data && (
        <header className={styles.header}>
          <GitBranch />
          <span className={styles.branch}>
            {data.branch ?? `Detached at ${data.headOid ?? 'no commits'}`}
          </span>
          {data.upstream && <span className={styles.upstream}>{data.upstream}</span>}
          <AheadBehind ahead={data.ahead} behind={data.behind} />
        </header>
      )}
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
      {data && changes.length === 0 && <EmptyState title="No changes" />}
      {changes.length > 0 && (
        <ul className={styles.list} aria-label="Changes">
          {changes.map((change) => (
            <ChangeRow
              key={change.path}
              change={change}
              selected={change.path === selectedPath}
              onSelect={setSelectedPath}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

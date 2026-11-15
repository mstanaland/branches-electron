import { ArrowRight, GitBranch } from 'lucide-react'
import { useCallback, useMemo, useRef } from 'react'
import {
  changedSide,
  hasStagedChanges,
  isConflict,
  sortChanges,
  splitPath,
  stagingState
} from '../../../shared/changes'
import type { FileChange } from '../../../shared/git'
import {
  describeError,
  useConfirmRemoveMissing,
  useSelection,
  useStaging,
  useStatus
} from '../data'
import { AheadBehind, Button, Checkbox, EmptyState } from '../ui'
import { CommitForm } from './CommitForm'
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
  if (isConflict(change)) {
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
  onSelect,
  onToggleStaged
}: {
  change: FileChange
  selected: boolean
  onSelect: (path: string) => void
  onToggleStaged: (change: FileChange) => void
}): React.JSX.Element {
  const conflict = isConflict(change)
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
        {/* A conflict has to be resolved before it can be staged, so it has no checkbox. */}
        {!conflict && (
          <Checkbox
            aria-label={`${change.path}: ${state === 'partial' ? 'partially staged' : state}`}
            checked={state === 'staged'}
            indeterminate={state === 'partial'}
            onCheckedChange={() => onToggleStaged(change)}
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
          onKeyDown={(event) => {
            // Space stages or unstages the row instead of re-selecting it, which is what
            // activating the button would otherwise do.
            if (event.key !== ' ') return
            event.preventDefault()
            onToggleStaged(change)
          }}
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
  const staging = useStaging(root, changes)
  const error = describeError(status.error ?? confirmRemoval.error ?? staging.error)
  const listRef = useRef<HTMLUListElement>(null)

  // Focus has to leave the commit form once a commit lands, or focusing the subject would
  // expand the form again right after it closed. With nothing left to list there is no list
  // to focus, so the form simply gives focus up.
  const focusChanges = useCallback(() => {
    if (listRef.current !== null) listRef.current.focus()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])

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
        <>
          <header className={styles.header}>
            <GitBranch />
            <span className={styles.branch}>
              {data.branch ?? `Detached at ${data.headOid ?? 'no commits'}`}
            </span>
            {data.upstream && <span className={styles.upstream}>{data.upstream}</span>}
            <AheadBehind ahead={data.ahead} behind={data.behind} />
          </header>
          {/* Pinned above the list, so a long list never scrolls Commit out of view. */}
          <CommitForm
            root={root}
            hasStaged={hasStagedChanges(changes)}
            stageAll={staging.stageAll}
            onCommitted={focusChanges}
          />
        </>
      )}
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
      {data && changes.length === 0 && <EmptyState title="No changes" />}
      {changes.length > 0 && (
        <ul ref={listRef} className={styles.list} aria-label="Changes" tabIndex={-1}>
          {changes.map((change) => (
            <ChangeRow
              key={change.path}
              change={change}
              selected={change.path === selectedPath}
              onSelect={setSelectedPath}
              onToggleStaged={staging.toggle}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

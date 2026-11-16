import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FileDiff, FolderX } from 'lucide-react'
import { api } from '../api'
import {
  WORKING,
  describeError,
  useConfirmRemoveMissing,
  useOpenRepository,
  useRepositories,
  useRepositoryMenu,
  useSelection,
  useStatus
} from '../data'
import { Badge, Button, EmptyState, Tooltip } from '../ui'
import { BranchTree } from './BranchTree'
import shared from './shared.module.css'
import styles from './Sidebar.module.css'

/**
 * The first view in the switcher: what is uncommitted. Outside the branch tree, because a
 * tree item would have to pretend to be a branch, and above it, because committing is what
 * you came to do (ADR 0006).
 *
 * The count is every change — staged, unstaged, untracked and conflicted — which is exactly
 * the number of rows the view itself lists. Hidden at zero rather than showing "0": a clean
 * repository has nothing to report.
 */
function WorkingItem({
  root,
  selected,
  onSelect
}: {
  root: string
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  // Subscribed here, not only where the changes are listed, so the count stays right while
  // the user is reading a branch's history.
  const status = useStatus(root)
  const count = status.data?.changes.length ?? 0

  return (
    <Button
      variant="quiet"
      className={styles.working}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <FileDiff />
      <span className={styles.workingLabel}>Working</span>
      {count > 0 && (
        <Badge aria-label={`${count} ${count === 1 ? 'change' : 'changes'}`}>{count}</Badge>
      )}
    </Button>
  )
}

/**
 * The saved repositories and the active repository's branches. Once a repository is active the
 * list folds into a header, so a long list of repositories doesn't push the branches off screen.
 */
export function Sidebar(): React.JSX.Element {
  const repositories = useRepositories()
  const open = useOpenRepository()
  const menu = useRepositoryMenu()
  const confirmRemoval = useConfirmRemoveMissing()
  const { activeRoot, setActiveRoot, view, setView } = useSelection()

  // Set to the active repository's root when the user reopens the list for it. Switching
  // repository changes the root, which folds the list again without any extra bookkeeping.
  const [reopenedFor, setReopenedFor] = useState<string | null>(null)

  // Opening a repository (button or Cmd+O) folds the list, even if it picked the one that is
  // already active, which changes no root. A cancelled picker leaves the list as it was.
  const { mutate } = open
  const openRepository = useCallback(
    () =>
      mutate(undefined, {
        onSuccess: (root) => {
          if (root !== null) setReopenedFor(null)
        }
      }),
    [mutate]
  )

  // File > Open Repository… (Cmd+O) lives in main's menu, which tells us to run the open flow.
  useEffect(() => api.onOpenRepositoryRequested(openRepository), [openRepository])

  // Roving tab stop: the list is one Tab stop, on the option focused last, else the active one.
  const [focusedRoot, setFocusedRoot] = useState<string | null>(null)

  const saved = repositories.data
  const active = saved?.find((repository) => repository.root === activeRoot)
  const listOpen = active === undefined || reopenedFor === active.root
  const tabStopRoot = [focusedRoot, activeRoot, saved?.[0]?.root].find((root) =>
    saved?.some((repository) => repository.root === root)
  )
  const error = describeError(
    open.error ?? menu.error ?? confirmRemoval.error ?? repositories.error
  )

  const openButton = <Button onClick={openRepository}>Open repository…</Button>

  return (
    <div className={styles.sidebar}>
      <nav className={styles.repositories} aria-label="Repositories">
        {active ? (
          <Tooltip content={active.missing ? `${active.name} can’t be found.` : null}>
            <Button
              variant="quiet"
              className={styles.header}
              aria-expanded={listOpen}
              aria-description={active.missing ? `${active.name} can’t be found.` : undefined}
              data-missing={active.missing ? 'true' : undefined}
              onClick={() => setReopenedFor(listOpen ? null : active.root)}
            >
              {active.missing && <FolderX />}
              <span className={styles.headerName}>{active.name}</span>
              {listOpen ? <ChevronDown /> : <ChevronRight />}
            </Button>
          </Tooltip>
        ) : (
          <h2 className={styles.heading}>Repositories</h2>
        )}
        {saved !== undefined && saved.length === 0 && (
          <EmptyState title="No repositories yet." action={openButton} />
        )}
        {saved !== undefined && saved.length > 0 && listOpen && (
          <>
            <ul className={styles.list} role="listbox" aria-label="Saved repositories">
              {saved.map((repository) => {
                /** Choosing a repository activates it; choosing a missing one offers to remove it. */
                const choose = (): void => {
                  if (repository.missing) confirmRemoval.mutate(repository.root)
                  else {
                    setActiveRoot(repository.root)
                    setReopenedFor(null)
                  }
                }
                const missingMessage = repository.missing
                  ? `${repository.name} can’t be found. Click to remove it from the list.`
                  : null
                return (
                  <Tooltip key={repository.root} content={missingMessage}>
                    <li
                      role="option"
                      aria-selected={repository.root === activeRoot}
                      aria-description={missingMessage ?? undefined}
                      tabIndex={repository.root === tabStopRoot ? 0 : -1}
                      className={styles.row}
                      data-missing={repository.missing ? 'true' : undefined}
                      onClick={choose}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        menu.mutate(repository.root)
                      }}
                      onFocus={() => setFocusedRoot(repository.root)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          choose()
                        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault()
                          const sibling =
                            event.key === 'ArrowDown'
                              ? event.currentTarget.nextElementSibling
                              : event.currentTarget.previousElementSibling
                          if (sibling instanceof HTMLElement) sibling.focus()
                        }
                      }}
                    >
                      {repository.missing && <FolderX />}
                      <span className={styles.rowName}>{repository.name}</span>
                    </li>
                  </Tooltip>
                )
              })}
            </ul>
            {openButton}
          </>
        )}
        {error && (
          <p role="alert" className={shared.error}>
            {error.message}
          </p>
        )}
      </nav>
      {active && !active.missing && (
        <>
          <WorkingItem
            root={active.root}
            selected={view.kind === 'working'}
            onSelect={() => setView(WORKING)}
          />
          <BranchTree root={active.root} />
        </>
      )}
    </div>
  )
}

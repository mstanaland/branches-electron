import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import {
  describeError,
  useConfirmRemoveMissing,
  useOpenRepository,
  useRepositories,
  useRepositoryMenu,
  useSelection
} from '../data'
import { BranchTree } from './BranchTree'
import styles from './Sidebar.module.css'

/**
 * The saved repositories and the active repository's branches. Once a repository is active the
 * list folds into a header, so a long list of repositories doesn't push the branches off screen.
 */
export function Sidebar(): React.JSX.Element {
  const repositories = useRepositories()
  const open = useOpenRepository()
  const menu = useRepositoryMenu()
  const confirmRemoval = useConfirmRemoveMissing()
  const { activeRoot, setActiveRoot } = useSelection()

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

  const openButton = (
    <button type="button" className={styles.openButton} onClick={openRepository}>
      Open repository…
    </button>
  )

  return (
    <div className={styles.sidebar}>
      <nav className={styles.repositories} aria-label="Repositories">
        {active ? (
          <button
            type="button"
            className={styles.header}
            aria-expanded={listOpen}
            data-missing={active.missing ? 'true' : undefined}
            title={active.missing ? `${active.name} can’t be found.` : undefined}
            onClick={() => setReopenedFor(listOpen ? null : active.root)}
          >
            <span className={styles.headerName}>{active.name}</span>
            <span className={styles.chevron} aria-hidden="true">
              {listOpen ? '▾' : '▸'}
            </span>
          </button>
        ) : (
          <h2 className={styles.heading}>Repositories</h2>
        )}
        {saved !== undefined && saved.length === 0 && (
          <div className={styles.empty}>
            <p>No repositories yet.</p>
            {openButton}
          </div>
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
                return (
                  <li
                    key={repository.root}
                    role="option"
                    aria-selected={repository.root === activeRoot}
                    tabIndex={repository.root === tabStopRoot ? 0 : -1}
                    className={styles.row}
                    data-missing={repository.missing ? 'true' : undefined}
                    title={
                      repository.missing
                        ? `${repository.name} can’t be found. Click to remove it from the list.`
                        : undefined
                    }
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
                    {repository.name}
                  </li>
                )
              })}
            </ul>
            {openButton}
          </>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error.message}
          </p>
        )}
      </nav>
      {active && !active.missing && <BranchTree root={active.root} />}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  describeError,
  useConfirmRemoveMissing,
  useOpenRepository,
  useRepositories,
  useRepositoryMenu,
  useSelection
} from '../data'
import styles from './Sidebar.module.css'

/** The saved repositories, with a way to open another and to switch the active one. */
export function Sidebar(): React.JSX.Element {
  const repositories = useRepositories()
  const open = useOpenRepository()
  const menu = useRepositoryMenu()
  const confirmRemoval = useConfirmRemoveMissing()
  const { activeRoot, setActiveRoot } = useSelection()

  // File > Open Repository… (Cmd+O) lives in main's menu, which tells us to run the open flow.
  const { mutate: openRepository } = open
  useEffect(() => api.onOpenRepositoryRequested(() => openRepository()), [openRepository])

  // Roving tab stop: the list is one Tab stop, on the option focused last, else the active one.
  const [focusedRoot, setFocusedRoot] = useState<string | null>(null)

  const saved = repositories.data
  const tabStopRoot = [focusedRoot, activeRoot, saved?.[0]?.root].find((root) =>
    saved?.some((repository) => repository.root === root)
  )
  const error = describeError(
    open.error ?? menu.error ?? confirmRemoval.error ?? repositories.error
  )

  const openButton = (
    <button type="button" className={styles.openButton} onClick={() => open.mutate()}>
      Open repository…
    </button>
  )

  return (
    <nav className={styles.sidebar} aria-label="Repositories">
      <h2 className={styles.heading}>Repositories</h2>
      {saved !== undefined && saved.length === 0 && (
        <div className={styles.empty}>
          <p>No repositories yet.</p>
          {openButton}
        </div>
      )}
      {saved !== undefined && saved.length > 0 && (
        <>
          <ul className={styles.list} role="listbox" aria-label="Saved repositories">
            {saved.map((repository) => {
              /** Choosing a repository activates it; choosing a missing one offers to remove it. */
              const choose = (): void => {
                if (repository.missing) confirmRemoval.mutate(repository.root)
                else setActiveRoot(repository.root)
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
  )
}

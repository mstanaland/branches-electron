import { useState } from 'react'
import { FolderGit2, FolderX } from 'lucide-react'
import {
  describeError,
  useConfirmRemoveMissing,
  useRepositories,
  useRepositoryMenu,
  useTabs
} from '../data'
import { Button, Tooltip } from '../ui'
import shared from './shared.module.css'
import styles from './Repositories.module.css'

/**
 * The surface for choosing a repository: the saved list on the left, and an empty state with
 * **Open Repository …** on the right. It renders both as a **Repositories tab**'s content and,
 * with no tab open, as the **backdrop** — one component, because they are the same surface and
 * only the tab form is closable (ADR 0007). Choosing a repository converts the focused tab in
 * place, or opens the first tab when this is the backdrop.
 *
 * The open-a-repository command is owned above, so the menu's Cmd+O reaches it from any tab;
 * this draws its button and reports whatever it failed with.
 */
export function Repositories({
  onOpenRepository,
  openError
}: {
  onOpenRepository: () => void
  openError: unknown
}): React.JSX.Element {
  const repositories = useRepositories()
  const menu = useRepositoryMenu()
  const confirmRemoval = useConfirmRemoveMissing()
  const { tabs, chooseRepository } = useTabs()

  // Roving tab stop: the list is one Tab stop, on the option focused last, else the first.
  const [focusedRoot, setFocusedRoot] = useState<string | null>(null)

  const saved = repositories.data
  const tabStopRoot = [focusedRoot, saved?.[0]?.root].find((root) =>
    saved?.some((repository) => repository.root === root)
  )
  const error = describeError(openError ?? menu.error ?? confirmRemoval.error ?? repositories.error)

  return (
    <div className={styles.repositories}>
      <nav className={styles.saved} aria-label="Repositories">
        <h2 className={styles.heading}>Repositories</h2>
        {saved !== undefined && saved.length === 0 && (
          <p className={styles.none}>No repositories yet.</p>
        )}
        {/* More than one repository can be open, so more than one option is marked. The
            tab strip is where that shows visually; here it is only announced. */}
        {saved !== undefined && saved.length > 0 && (
          <ul
            className={styles.list}
            role="listbox"
            aria-multiselectable
            aria-label="Saved repositories"
          >
            {saved.map((repository) => {
              /** Choosing opens it in a tab; choosing a missing one offers to remove it. */
              const choose = (): void => {
                if (repository.missing) confirmRemoval.mutate(repository.root)
                else chooseRepository(repository.root)
              }
              const missingMessage = repository.missing
                ? `${repository.name} can’t be found. Click to remove it from the list.`
                : null
              return (
                <Tooltip key={repository.root} content={missingMessage}>
                  <li
                    role="option"
                    // Already in a tab, which is where choosing it again takes you.
                    aria-selected={tabs.some((tab) => tab.root === repository.root)}
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
                    {repository.missing ? <FolderX /> : <FolderGit2 />}
                    <span className={styles.rowName}>{repository.name}</span>
                  </li>
                </Tooltip>
              )
            })}
          </ul>
        )}
        {error && (
          <p role="alert" className={shared.error}>
            {error.message}
          </p>
        )}
      </nav>
      <div className={styles.pane}>
        <div className={styles.hero}>
          <span className={styles.heroIcon}>
            <FolderGit2 size={26} />
          </span>
          <h1 className={styles.heroTitle}>
            Choose an imported repository from the list or add a new one
          </h1>
          <Button variant="primary" onClick={onOpenRepository}>
            Open Repository…
          </Button>
        </div>
      </div>
    </div>
  )
}

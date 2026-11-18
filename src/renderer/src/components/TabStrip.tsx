import { useState } from 'react'
import { FolderX, Plus, X } from 'lucide-react'
import { useRepositories, useTabs } from '../data'
import type { SavedRepository } from '../../../shared/git'
import type { Tab } from '../data'
import { cannotBeFound } from './MissingRepository'
import { Button } from '../ui'
import styles from './TabStrip.module.css'

/** What a tab is called: its repository's saved name, else the folder, else the empty kind. */
function tabLabel(tab: Tab, saved: readonly SavedRepository[] | undefined): string {
  if (tab.root === null) return 'Repositories'
  const name = saved?.find((repository) => repository.root === tab.root)?.name
  // The saved list may not have loaded yet, and the folder name is what it would say anyway.
  return name ?? tab.root.split('/').filter(Boolean).pop() ?? tab.root
}

/**
 * Whether the tab's repository is a **missing repository**. A tab can restore pointing at one,
 * because tabs come back across launches and folders move in between; it is flagged rather
 * than dropped, so the user sees what happened instead of losing a tab silently.
 */
function isMissing(tab: Tab, saved: readonly SavedRepository[] | undefined): boolean {
  return tab.root !== null && saved?.find((r) => r.root === tab.root)?.missing === true
}

/**
 * The horizontal strip of **tabs** below the title bar, with the `+` that opens a
 * **Repositories tab**. `+` is absent once the strip is full, so the four-tab limit is visible
 * rather than discovered by a click that does nothing (ADR 0007).
 *
 * Deliberately not an ARIA `tablist`: that contract wants arrow keys cycling within the strip
 * and a `tabpanel` per tab, and a `tab` may not contain the `×` button each one needs. The
 * strip is a list of buttons with `aria-current` on the **focused tab** instead, which says
 * the same thing without a contract we would be breaking — the same call ADR 0006 made for
 * the sidebar. The keyboard reaches tabs through the application menu (`Cmd+T`, `Cmd+1`…).
 */
export function TabStrip(): React.JSX.Element {
  const { tabs, focused, canOpenTab, openTab, focusTab, closeTab } = useTabs()
  const repositories = useRepositories()
  // The `×` shows on the focused tab and on whichever tab the pointer is over, so the strip
  // is not a row of clutter. Tracked here rather than in CSS so it is one rule, and testable.
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <div className={styles.strip}>
      <nav aria-label="Tabs">
        <ul className={styles.tabs}>
          {tabs.map((tab) => {
            const label = tabLabel(tab, repositories.data)
            const missing = isMissing(tab, repositories.data)
            const isFocused = tab.id === focused?.id
            return (
              <li
                key={tab.id}
                className={styles.tab}
                data-focused={isFocused ? 'true' : undefined}
                data-missing={missing ? 'true' : undefined}
                onPointerEnter={() => setHoveredId(tab.id)}
                onPointerLeave={() =>
                  setHoveredId((current) => (current === tab.id ? null : current))
                }
              >
                <Button
                  variant="quiet"
                  className={styles.label}
                  aria-current={isFocused ? 'true' : undefined}
                  // The icon is decorative, so the flag has to reach assistive tech as text.
                  aria-description={missing ? `${cannotBeFound(label)}.` : undefined}
                  onClick={() => focusTab(tab.id)}
                >
                  {missing && <FolderX className={styles.missing} />}
                  <span className={styles.labelText}>{label}</span>
                </Button>
                {(isFocused || tab.id === hoveredId) && (
                  <Button
                    variant="quiet"
                    className={styles.close}
                    aria-label={`Close ${label}`}
                    onClick={() => closeTab(tab.id)}
                  >
                    <X />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
      {canOpenTab && (
        <Button variant="quiet" className={styles.add} aria-label="New tab" onClick={openTab}>
          <Plus />
        </Button>
      )}
    </div>
  )
}

import { Plus } from 'lucide-react'
import { useRepositories, useTabs } from '../data'
import type { SavedRepository } from '../../../shared/git'
import type { Tab } from '../data'
import { Button } from '../ui'
import styles from './TabStrip.module.css'
import { TabItem } from './TabItem'

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
function getIsMissing(tab: Tab, saved: readonly SavedRepository[] | undefined): boolean {
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

  return (
    <div className={styles.strip}>
      <nav aria-label="Tabs" className={styles.nav}>
        <ul className={styles.tabsList}>
          {tabs.map((tab) => {
            const label = tabLabel(tab, repositories.data)
            const isFocused = tab.id === focused?.id
            const isMissing = getIsMissing(tab, repositories.data)

            return (
              <TabItem
                key={tab.id}
                label={label}
                isFocused={isFocused}
                isMissing={isMissing}
                onClose={() => closeTab(tab.id)}
                onClick={() => focusTab(tab.id)}
              />
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

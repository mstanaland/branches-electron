import { InProgressBar } from './components/InProgressBar'
import { ChangedFiles } from './components/ChangedFiles'
import { CommitHistory } from './components/CommitHistory'
import { DiffView } from './components/DiffView'
import { MissingRepository } from './components/MissingRepository'
import { Repositories } from './components/Repositories'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { TitleBar } from './components/TitleBar'
import {
  useBackgroundFetch,
  useOpenRepository,
  useRepositories,
  useTabMenu,
  useTabs,
  viewRef
} from './data'
import styles from './App.module.css'

/**
 * The window: a **title bar** and a strip of **tabs** spanning it, and below them the **focused
 * tab**'s repository — its branches on the left and whichever **view** the sidebar has
 * selected on the right. Between the two, the **in-progress bar** says when reading that
 * repository is taking a while.
 *
 * With no repository in the focused tab, or no tab at all, the **Repositories** surface fills
 * the content area instead: as that tab's content, or as the **backdrop** (ADR 0007). The
 * sidebar is absent then, because there are no branches to switch views within.
 *
 * Every tab shortcut — Cmd+T, Cmd+W, Cmd+1 … Cmd+4 and the two step shortcuts — arrives as a
 * command from main's **Window menu** rather than a key handler here (ADR 0008).
 *
 * A tab whose repository has gone **missing** — tabs come back across launches, folders move
 * in between — gets the same treatment: an explanation and a way out, in place of panes that
 * have no folder to read.
 */
function App(): React.JSX.Element {
  const { tabs, focused } = useTabs()
  const repositories = useRepositories()
  // Owned here, not in the surface that draws its button: the menu's Cmd+O has to reach it
  // whatever the focused tab is showing.
  const open = useOpenRepository()
  // Owned here for the same reason: the Window menu's tab shortcuts reach the whole strip,
  // not whatever tab is in front.
  useTabMenu()
  useBackgroundFetch()

  const root = focused?.root ?? null
  // The saved entry when the focused tab's folder is known to be gone, which is the one case
  // the repository's own panes can't be drawn for. Null while the list is still loading: the
  // panes start their own slower git reads in the same render, so they are still pending when
  // the list lands, and guessing "missing" would be worse than being briefly behind.
  const missing = repositories.data?.find((r) => r.root === root && r.missing) ?? null
  // A repository whose folder is gone has no branches to read, so no view to switch.
  const sidebarRoot = missing === null ? root : null
  // Null for Working, which is the only view that isn't a history of something.
  const ref = focused === null ? null : viewRef(focused.view)

  return (
    <div className={styles.app}>
      <TitleBar />
      {tabs.length > 0 && <TabStrip />}
      {root !== null && <InProgressBar key={root} root={root} />}
      <div className={styles.body} data-sidebar={sidebarRoot === null ? 'false' : 'true'}>
        {sidebarRoot !== null && (
          <aside className={styles.sidebar}>
            <Sidebar root={sidebarRoot} />
          </aside>
        )}
        <main className={styles.content}>
          {root === null ? (
            <Repositories onOpenRepository={open.mutate} openError={open.error} />
          ) : missing !== null ? (
            <MissingRepository repository={missing} />
          ) : ref === null ? (
            // Keyed as a whole so switching tab starts both panes fresh.
            <div key={root} className={styles.split}>
              <ChangedFiles root={root} />
              <DiffView root={root} />
            </div>
          ) : (
            <CommitHistory root={root} commitRef={ref} />
          )}
        </main>
      </div>
    </div>
  )
}

export default App

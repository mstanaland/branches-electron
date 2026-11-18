import { ChangedFiles } from './components/ChangedFiles'
import { CommitHistory } from './components/CommitHistory'
import { DiffView } from './components/DiffView'
import { Repositories } from './components/Repositories'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { useBackgroundFetch, useOpenRepository, useRepositories, useTabs, viewRef } from './data'
import styles from './App.module.css'

/**
 * The window: a strip of **tabs**, and below it the **focused tab**'s repository — its
 * branches on the left and whichever **view** the sidebar has selected on the right.
 *
 * With no repository in the focused tab, or no tab at all, the **Repositories** surface fills
 * the content area instead: as that tab's content, or as the **backdrop** (ADR 0007). The
 * sidebar is absent then, because there are no branches to switch views within.
 */
function App(): React.JSX.Element {
  const { tabs, focused } = useTabs()
  const repositories = useRepositories()
  // Owned here, not in the surface that draws its button: the menu's Cmd+O has to reach it
  // whatever the focused tab is showing.
  const open = useOpenRepository()
  useBackgroundFetch()

  const root = focused?.root ?? null
  const saved = repositories.data?.find((repository) => repository.root === root)
  // A repository whose folder is gone has no branches to read, so no view to switch.
  const sidebarRoot = root !== null && saved?.missing !== true ? root : null
  // Null for Working, which is the only view that isn't a history of something.
  const ref = focused === null ? null : viewRef(focused.view)

  return (
    <div className={styles.app} data-sidebar={sidebarRoot === null ? 'false' : 'true'}>
      {sidebarRoot !== null && (
        <aside className={styles.sidebar}>
          <div className={styles.titlebar} />
          <Sidebar root={sidebarRoot} />
        </aside>
      )}
      <main className={styles.content}>
        <div className={styles.titlebar} />
        {tabs.length > 0 && <TabStrip />}
        {root === null ? (
          <Repositories onOpenRepository={open.mutate} openError={open.error} />
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
  )
}

export default App

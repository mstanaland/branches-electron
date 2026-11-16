import { ChangedFiles } from './components/ChangedFiles'
import { CommitHistory } from './components/CommitHistory'
import { DiffView } from './components/DiffView'
import { Sidebar } from './components/Sidebar'
import { useBackgroundFetch, useRepositories, useSelection, viewRef } from './data'
import styles from './App.module.css'

function App(): React.JSX.Element {
  const { activeRoot, view } = useSelection()
  const repositories = useRepositories()
  useBackgroundFetch()
  const active = repositories.data?.find((repository) => repository.root === activeRoot)
  // Null for Working, which is the only view that isn't a history of something.
  const ref = viewRef(view)

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.titlebar} />
        <Sidebar />
      </aside>
      <main className={styles.content}>
        <div className={styles.titlebar} />
        {active === undefined ? (
          <div className={styles.empty}>
            <h1>Branches</h1>
            <p>Open a repository to get started.</p>
          </div>
        ) : ref === null ? (
          <div className={styles.split}>
            <ChangedFiles key={active.root} root={active.root} />
            <DiffView key={active.root} root={active.root} />
          </div>
        ) : (
          <CommitHistory root={active.root} commitRef={ref} />
        )}
      </main>
    </div>
  )
}

export default App

import { ChangedFiles } from './components/ChangedFiles'
import { DiffView } from './components/DiffView'
import { Sidebar } from './components/Sidebar'
import { useBackgroundFetch, useRepositories, useSelection } from './data'
import styles from './App.module.css'

function App(): React.JSX.Element {
  const { activeRoot } = useSelection()
  const repositories = useRepositories()
  useBackgroundFetch()
  const active = repositories.data?.find((repository) => repository.root === activeRoot)

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.titlebar} />
        <Sidebar />
      </aside>
      <main className={styles.content}>
        <div className={styles.titlebar} />
        {active ? (
          <div className={styles.split}>
            <ChangedFiles key={active.root} root={active.root} />
            <DiffView key={active.root} root={active.root} />
          </div>
        ) : (
          <div className={styles.empty}>
            <h1>Branches</h1>
            <p>Open a repository to get started.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App

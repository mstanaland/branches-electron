import { Sidebar } from './components/Sidebar'
import { useRepositories, useSelection } from './data'
import styles from './App.module.css'

function App(): React.JSX.Element {
  const { activeRoot } = useSelection()
  const repositories = useRepositories()
  const active = repositories.data?.find((repository) => repository.root === activeRoot)

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.titlebar} />
        <Sidebar />
      </aside>
      <main className={styles.content}>
        <div className={styles.titlebar} />
        <div className={styles.empty}>
          {/* Placeholder: the changed-files tickets fill this pane. */}
          <h1>{active ? active.name : 'Branches'}</h1>
          <p>{active ? active.root : 'Open a repository to get started.'}</p>
        </div>
      </main>
    </div>
  )
}

export default App

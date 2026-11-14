import { useQuery } from '@tanstack/react-query'
import styles from './App.module.css'

function App(): React.JSX.Element {
  const { data: version } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => window.api.appVersion()
  })

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.titlebar} />
        <p className={styles.sectionLabel}>Branches</p>
      </aside>
      <main className={styles.content}>
        <div className={styles.titlebar} />
        <div className={styles.empty}>
          <h1>Branches</h1>
          <p>Open a repository to get started.</p>
          {version && <p className={styles.version}>v{version}</p>}
        </div>
      </main>
    </div>
  )
}

export default App

import { useMutation } from '@tanstack/react-query'
import { api } from './api'
import styles from './App.module.css'

function App(): React.JSX.Element {
  // TEMPORARY: proves the bridge works end to end. The sidebar tickets replace this.
  const open = useMutation({
    mutationFn: async () => {
      const root = await api.openRepository()
      if (root === null) return null
      const [status, branches] = await Promise.all([api.getStatus(root), api.listBranches(root)])
      console.log('opened', root, { status, branches })
      return root
    },
    onError: (error) => console.error('open failed', error)
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
          <button type="button" onClick={() => open.mutate()}>
            Open repository… (temporary)
          </button>
        </div>
      </main>
    </div>
  )
}

export default App

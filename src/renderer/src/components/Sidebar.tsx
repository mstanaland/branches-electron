import { FileDiff, RefreshCw } from 'lucide-react'
import { WORKING, useRefreshRepository, useSelection, useStatus } from '../data'
import { Badge, Button } from '../ui'
import { BranchTree } from './BranchTree'
import shared from './shared.module.css'
import styles from './Sidebar.module.css'

/**
 * The first view in the switcher: what is uncommitted. Outside the branch tree, because a
 * tree item would have to pretend to be a branch, and above it, because committing is what
 * you came to do (ADR 0006).
 *
 * The count is every change — staged, unstaged, untracked and conflicted — which is exactly
 * the number of rows the view itself lists. Hidden at zero rather than showing "0": a clean
 * repository has nothing to report.
 */
function WorkingItem({
  root,
  selected,
  onSelect
}: {
  root: string
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  // Subscribed here, not only where the changes are listed, so the count stays right while
  // the user is reading a branch's history.
  const status = useStatus(root)
  const count = status.data?.changes.length ?? 0

  return (
    <Button
      variant="quiet"
      className={styles.working}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <FileDiff />
      <span className={styles.workingLabel}>Working</span>
      {count > 0 && (
        <Badge aria-label={`${count} ${count === 1 ? 'change' : 'changes'}`}>{count}</Badge>
      )}
    </Button>
  )
}

/**
 * The **Refresh** control, at the foot of the column: re-reads the repository from disk, as
 * regaining focus does, for when something changed it behind the app's back and the window
 * never lost focus. It touches no network — that is Fetch's job, in the title bar.
 *
 * While a refresh is in flight the icon spins and the control is disabled, read from the query
 * client so switching tab and back doesn't lose it.
 */
function RefreshButton({ root }: { root: string }): React.JSX.Element {
  const refresh = useRefreshRepository(root)

  return (
    <div className={styles.footer}>
      <Button
        variant="quiet"
        disabled={refresh.busy}
        aria-busy={refresh.busy || undefined}
        onClick={refresh.start}
      >
        <RefreshCw className={refresh.busy ? shared.spinner : undefined} />
        Refresh
      </Button>
    </div>
  )
}

/**
 * The **view** switcher for the **focused tab**'s repository: Working, then its branches, and
 * nothing else; Refresh sits at its foot, outside the switcher (ADR 0006). Repositories are chosen from tabs now (ADR 0007), so the foldable repository
 * picker that used to sit above this is gone and the branch list has the whole column.
 *
 * Rendered only where there is a repository to switch views within, so never for a
 * **Repositories tab**, the **backdrop**, or a **missing repository**, which has no branches.
 */
export function Sidebar({ root }: { root: string }): React.JSX.Element {
  const { view, setView } = useSelection()

  return (
    <div className={styles.sidebar}>
      <WorkingItem
        root={root}
        selected={view.kind === 'working'}
        onSelect={() => setView(WORKING)}
      />
      <BranchTree root={root} />
      <RefreshButton root={root} />
    </div>
  )
}

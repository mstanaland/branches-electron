import { FileDiff } from 'lucide-react'
import { WORKING, useSelection, useStatus } from '../data'
import { Badge, Button } from '../ui'
import { BranchTree } from './BranchTree'
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
 * The **view** switcher for the **focused tab**'s repository: Working, then its branches, and
 * nothing else. Repositories are chosen from tabs now (ADR 0007), so the foldable repository
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
    </div>
  )
}

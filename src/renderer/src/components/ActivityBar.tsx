import { useDelayed, useRepositoryBusy } from '../data'
import { ProgressBar } from '../ui'
import styles from './ActivityBar.module.css'

/**
 * How long something has to be in flight before the bar shows. Most reads of a local
 * repository finish well inside it, so the common refresh never flashes the bar; a large
 * repository, or a fetch over a slow network, is still visibly working.
 */
export const ACTIVITY_DELAY_MS = 400

/**
 * The **in-progress bar**: a thin indeterminate bar spanning the window below the tab strip,
 * shown while anything for the **active repository** is in flight — after a short delay, so
 * a large repository never reads as frozen and a small one never flickers.
 *
 * It sits over the top edge of the columns rather than taking a row of its own, so showing
 * and hiding it never moves anything. What is on screen stays there underneath it: a refetch
 * keeps the previous data until the new read lands.
 *
 * Keyed by root where it is used, so the delay starts again for a tab switched to.
 */
export function ActivityBar({ root }: { root: string }): React.JSX.Element {
  const shown = useDelayed(useRepositoryBusy(root), ACTIVITY_DELAY_MS)

  return (
    <div className={styles.slot}>
      {shown && <ProgressBar aria-label="In progress" className={styles.bar} />}
    </div>
  )
}

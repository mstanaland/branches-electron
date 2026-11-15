import { ArrowDown, ArrowUp } from 'lucide-react'
import styles from './AheadBehind.module.css'

/** "2 ahead, 1 behind", or null when the branch is level with its upstream. */
export function aheadBehindLabel(ahead: number, behind: number): string | null {
  const parts = [
    ahead > 0 ? `${ahead} ahead` : null,
    behind > 0 ? `${behind} behind` : null
  ].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(', ') : null
}

/** How far a branch has moved from its upstream. Renders nothing when level. */
export function AheadBehind({
  ahead,
  behind
}: {
  ahead: number
  behind: number
}): React.JSX.Element | null {
  const label = aheadBehindLabel(ahead, behind)
  if (label === null) return null

  return (
    <span role="img" aria-label={label} className={styles.counts}>
      {ahead > 0 && (
        <span className={styles.count}>
          <ArrowUp />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className={styles.count}>
          <ArrowDown />
          {behind}
        </span>
      )}
    </span>
  )
}

import styles from './Pending.module.css'

export interface PendingProps {
  /** What is being waited for, as screen readers hear it — "Loading branches". */
  label: string
}

/**
 * Stands in for content that has never been read yet, so a column still waiting for its
 * first read looks different from one with nothing to show.
 *
 * Only for a first load: once there is data, a refetch keeps it on screen instead. The text
 * fades in after a short delay, so the common fast read never flashes it; it is in the
 * document from the start, so assistive technology knows the column is loading.
 */
export function Pending({ label }: PendingProps): React.JSX.Element {
  return (
    <div role="status" aria-label={label} className={styles.pending}>
      Loading…
    </div>
  )
}

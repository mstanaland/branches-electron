import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  title: string
  detail?: string
  /** Usually a `Button` offering the way out of the empty state. */
  action?: React.ReactNode
}

export function EmptyState({ title, detail, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className={styles.emptyState}>
      <p className={styles.title}>{title}</p>
      {detail && <p className={styles.detail}>{detail}</p>}
      {action}
    </div>
  )
}

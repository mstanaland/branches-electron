import { FolderX } from 'lucide-react'
import { describeError, useConfirmRemoveMissing } from '../data'
import { Button, EmptyState } from '../ui'
import shared from './shared.module.css'
import styles from './MissingRepository.module.css'

/**
 * A **repository tab**'s content when its folder has moved or been deleted. Tabs come back
 * across launches, so a tab can restore pointing at a **missing repository**; it is flagged
 * rather than dropped, and this is the way out — **Remove from List**, through the same native
 * confirmation the saved list uses (ADR 0003). Confirming removes the saved repository, which
 * closes this tab; cancelling leaves both alone.
 *
 * Nothing here reads git: there is no folder to read.
 */
export function MissingRepository({
  root,
  name
}: {
  root: string
  name: string
}): React.JSX.Element {
  const confirmRemoval = useConfirmRemoveMissing()
  const error = describeError(confirmRemoval.error)

  return (
    <div className={styles.pane}>
      <span className={styles.icon}>
        <FolderX size={26} />
      </span>
      <EmptyState
        title={`${name} can’t be found`}
        detail={`There is no repository at ${root} any more. It may have been moved, renamed or deleted.`}
        action={
          <Button
            variant="primary"
            onClick={() => confirmRemoval.mutate(root)}
            disabled={confirmRemoval.isPending}
          >
            Remove from List
          </Button>
        }
      />
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
    </div>
  )
}

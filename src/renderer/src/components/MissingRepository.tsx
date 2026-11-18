import { FolderX } from 'lucide-react'
import { describeError, useConfirmRemoveMissing } from '../data'
import type { SavedRepository } from '../../../shared/git'
import { Button, EmptyState } from '../ui'
import shared from './shared.module.css'
import styles from './MissingRepository.module.css'

/**
 * How a **missing repository** is put to the user, wherever it is said: here, in the tab
 * label, and in the saved list. One sentence without its full stop, so each caller can
 * punctuate or continue it, and one place to change the wording.
 */
export function cannotBeFound(name: string): string {
  return `${name} can’t be found`
}

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
  repository
}: {
  repository: SavedRepository
}): React.JSX.Element {
  const { root, name } = repository
  const confirmRemoval = useConfirmRemoveMissing()
  const error = describeError(confirmRemoval.error)

  return (
    <div className={styles.pane}>
      <span className={styles.icon}>
        <FolderX size={26} />
      </span>
      <EmptyState
        title={cannotBeFound(name)}
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

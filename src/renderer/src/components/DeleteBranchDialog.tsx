import { LoaderCircle } from 'lucide-react'
import { useRef } from 'react'
import type { BranchDeletion } from '../../../shared/git'
import { describeError, useBranchDeletion, useDeleteBranch } from '../data'
import { Button, Dialog, Pending } from '../ui'
import styles from './DeleteBranchDialog.module.css'
import shared from './shared.module.css'

/** "3 commits aren’t" or "1 commit isn’t" — the count with its noun and verb agreeing. */
function commitsAreNot(count: number, between = ''): string {
  return count === 1 ? `1 commit${between} isn’t` : `${count} commits${between} aren’t`
}

/**
 * What the dialog says about the **branch-only commits**, by tier (ADR 0009): nothing when
 * there are none; a calm note when the upstream is **gone**, since a squash or rebase merge
 * leaves exactly that behind; a danger alert otherwise.
 */
function Warning({ deletion }: { deletion: BranchDeletion }): React.JSX.Element | null {
  const count = deletion.branchOnlyCommits
  if (count === 0) return null
  const gone = deletion.goneUpstream
  if (gone !== null) {
    // Background fetch prunes, so whether anything was committed after the upstream went
    // can't be known. The note says so rather than guessing.
    return (
      <p className={styles.note}>
        {gone.name} was deleted from {gone.remote}. This branch’s {commitsAreNot(count)} on any
        other branch — if it was merged with a squash or rebase {count === 1 ? 'it’s' : 'they’re'}{' '}
        already in; anything committed after that will be lost.
      </p>
    )
  }
  return (
    <p role="alert" className={styles.danger}>
      {commitsAreNot(count, ' on this branch')} on any other branch or remote, and will be lost.
    </p>
  )
}

/**
 * **Delete branch**: confirms deleting a local branch, chosen from its context menu. Counts
 * the branch's **branch-only commits** on opening and warns by them; confirming always
 * deletes, but only while the branch is still where it was counted.
 *
 * Mounted only while open, so each opening counts afresh with no old failure. Cancel has
 * initial focus, so Return never deletes. While the delete runs the dialog can't be
 * dismissed; a failure stays inside, for a retry or a Cancel.
 */
export function DeleteBranchDialog({
  root,
  name,
  onClose,
  onDeleted
}: {
  root: string
  name: string
  onClose: () => void
  /** Called once the branch is gone, before the dialog closes. */
  onDeleted: () => void
}): React.JSX.Element {
  const deletion = useBranchDeletion(root, name)
  const { deleteBranch, busy, error } = useDeleteBranch(root)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const failure = describeError(error ?? deletion.error)

  const submit = (): void => {
    if (deletion.data === undefined || busy) return
    deleteBranch(deletion.data).then(
      () => {
        onDeleted()
        onClose()
      },
      () => {
        // The failure is shown from `error`; the dialog stays open for a retry.
      }
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      title="Delete Branch"
      initialFocus={cancelRef}
      actions={
        <>
          <Button ref={cancelRef} disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy || deletion.data === undefined}
            aria-busy={busy || undefined}
            onClick={submit}
          >
            {busy && <LoaderCircle className={shared.spinner} />}
            Delete Branch
          </Button>
        </>
      }
    >
      <p className={styles.message}>
        Deleting this branch “<span className={styles.branch}>{name}</span>” will remove it from
        your repository.
      </p>
      {deletion.isPending && <Pending label="Checking for commits only this branch has" />}
      {deletion.data && <Warning deletion={deletion.data} />}
      {failure && (
        <p role="alert" className={styles.error}>
          {failure.message}
        </p>
      )}
    </Dialog>
  )
}

import { GitMerge, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { Branch } from '../../../shared/git'
import {
  WORKING,
  describeError,
  useBranches,
  useMergedBranches,
  useOpenPullRequest,
  useSelection
} from '../data'
import { timeAgo } from '../relativeTime'
import { Alert, Button } from '../ui'
import { DeleteBranchDialog } from './DeleteBranchDialog'
import styles from './MergedBranchAlert.module.css'
import shared from './shared.module.css'

/** Why Delete is off for `branch`, or null when it can be deleted. */
function undeletableReason(branch: Branch | undefined): string | null {
  if (branch?.isCurrent) return 'Switch to another branch to delete it'
  if (branch?.checkedOutElsewhere) return 'Switch its work tree to another branch to delete it'
  return null
}

/**
 * Above the History of a **merged branch**: which **pull request** merged it, into what and when,
 * a link that opens it on GitHub, and a way to delete the branch through the Delete Branch dialog. Nothing for any
 * other branch. It can't be dismissed: it stays while the branch is merged and still here.
 *
 * Delete is off, saying why, for the **current branch** and a branch checked out in another
 * work tree, which git won't delete. The **default branch** is never a merged branch.
 */
export function MergedBranchAlert({
  root,
  name
}: {
  root: string
  name: string
}): React.JSX.Element | null {
  const pullRequest = useMergedBranches(root).data?.get(name)
  const branches = useBranches(root)
  const openPullRequest = useOpenPullRequest(root)
  const { view, setView } = useSelection()
  const [deleting, setDeleting] = useState(false)
  const reasonId = useId()

  if (pullRequest === undefined) return null
  const branch = branches.data?.find((candidate) => candidate.name === name)
  const reason = undeletableReason(branch)
  // Until the branch list has loaded, whether it can be deleted isn't known.
  const canDelete = branch !== undefined && reason === null
  const openError = describeError(openPullRequest.error)

  return (
    <>
      <Alert
        variant="info"
        heading="This branch has been merged"
        aria-label="Merged branch"
        className={styles.alert}
        icon={<GitMerge size={16} />}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!canDelete}
              focusableWhenDisabled
              aria-describedby={reason === null ? undefined : reasonId}
              onClick={() => setDeleting(true)}
            >
              <Trash2 aria-hidden="true" />
              Delete Branch
            </Button>
            {reason !== null && (
              <span id={reasonId} className={styles.reason}>
                {reason}
              </span>
            )}
          </>
        }
      >
        Merged into “{pullRequest.baseBranch}”{' '}
        <span className={styles.when}>{timeAgo(pullRequest.mergedAt)}</span> by{' '}
        <Button
          variant="link"
          aria-label={`PR #${pullRequest.number}, opens on GitHub`}
          onClick={() => openPullRequest.mutate(pullRequest.url)}
        >
          PR #{pullRequest.number}
        </Button>
        {openError && (
          <p role="alert" className={shared.error}>
            {openError.message}
          </p>
        )}
      </Alert>
      {deleting && (
        <DeleteBranchDialog
          root={root}
          name={name}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            // As from the branch's context menu: the History of a branch that is gone falls
            // back to the view that always exists.
            if (view.kind === 'branch' && view.name === name) setView(WORKING)
          }}
        />
      )}
    </>
  )
}

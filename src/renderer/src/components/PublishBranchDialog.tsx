import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import type { PublishableTarget } from '../../../shared/git'
import { defaultPublishRemote } from '../../../shared/publish'
import { describeError, usePublishBranch } from '../data'
import { Button, Dialog, Select } from '../ui'
import styles from './PublishBranchDialog.module.css'
import shared from './shared.module.css'

/**
 * **Publish branch**: creates the **current branch** on a **remote** under the same name and
 * makes it the branch's **upstream**. Opened from the Publish control, for a branch with no
 * upstream or one that is **gone**.
 *
 * Mounted only while open, so each opening starts on the default remote with no old failure.
 * While the push runs the dialog can't be dismissed: Cancel is disabled and Escape ignored,
 * so the user sees how it ended. A failure stays inside, for a retry or a Cancel.
 */
export function PublishBranchDialog({
  root,
  target,
  onClose
}: {
  root: string
  /** Read when the dialog opened, and kept current by the query behind it. */
  target: PublishableTarget
  onClose: () => void
}): React.JSX.Element {
  const { publish, busy, error } = usePublishBranch(root)
  const [chosen, setChosen] = useState(() => defaultPublishRemote(target))
  const publishRef = useRef<HTMLButtonElement>(null)
  const branch = target.branch
  // A refetch can take the chosen remote away; fall back rather than offer a remote that's gone.
  const remote =
    target.remotes.find((candidate) => candidate.name === chosen) ??
    target.remotes.find((candidate) => candidate.name === defaultPublishRemote(target))
  const failure = describeError(error)

  const submit = (): void => {
    if (remote === undefined || busy) return
    publish(remote.name).then(onClose, () => {
      // The failure is shown from `error`; the dialog stays open for a retry.
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      title="Publish Branch"
      description="Creates a new branch on the selected remote repository. The local branch will automatically push to and pull from the new remote branch."
      initialFocus={publishRef}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            ref={publishRef}
            variant="primary"
            disabled={busy || remote === undefined}
            aria-busy={busy || undefined}
            onClick={submit}
          >
            {busy && <LoaderCircle className={shared.spinner} />}
            Publish Branch
          </Button>
        </>
      }
    >
      <dl className={styles.fields}>
        <dt>Branch</dt>
        <dd className={styles.branch}>{branch}</dd>
        <dt>Remote</dt>
        <dd>
          {target.remotes.length > 1 && remote !== undefined ? (
            <Select
              label="Remote"
              value={remote.name}
              onValueChange={setChosen}
              options={target.remotes.map(({ name }) => ({ value: name, label: name }))}
              disabled={busy}
            />
          ) : (
            <span>{remote?.name}</span>
          )}
          {remote?.url && <span className={styles.url}>{remote.url}</span>}
        </dd>
      </dl>
      {target.goneFrom !== null && (
        <p className={styles.note}>
          {branch} was deleted from {target.goneFrom}. Publishing creates it again.
        </p>
      )}
      {remote?.hasBranch && (
        <p className={styles.note}>
          {remote.name} already has {branch}
        </p>
      )}
      {failure && (
        <p role="alert" className={styles.error}>
          {failure.message}
        </p>
      )}
    </Dialog>
  )
}

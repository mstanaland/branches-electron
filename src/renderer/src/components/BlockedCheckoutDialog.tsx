import { Button, Dialog, DialogClose } from '../ui'
import styles from './BlockedCheckoutDialog.module.css'

/**
 * Says which files stop a checkout. Open while `branch` is set. It offers no way around them
 * yet (no stash, no discard): the user sorts the files out and tries again.
 */
export function BlockedCheckoutDialog({
  branch,
  files,
  onClose
}: {
  branch: string | null
  files: readonly string[]
  onClose: () => void
}): React.JSX.Element {
  return (
    <Dialog
      open={branch !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Can’t switch to ${branch ?? ''}`}
      description="These files have changes that switching would overwrite. Sort them out first, then try again."
      actions={<DialogClose render={<Button variant="primary" />}>OK</DialogClose>}
    >
      <ul className={styles.files}>
        {files.map((file) => (
          <li key={file}>{file}</li>
        ))}
      </ul>
    </Dialog>
  )
}

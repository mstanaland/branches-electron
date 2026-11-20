import { LoaderCircle } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { describeError, useCreateBranch } from '../data'
import { Button, Dialog, TextField } from '../ui'
import { BlockedCheckoutDialog } from './BlockedCheckoutDialog'
import shared from './shared.module.css'

export function CreateBranchDialog({
  root,
  source,
  onClose,
  onCreated
}: {
  root: string
  source: string
  onClose: () => void
  onCreated: (name: string) => void
}): React.JSX.Element {
  const create = useCreateBranch(root, source)
  const formId = useId()
  const nameRef = useRef<HTMLElement>(null)
  const [name, setName] = useState('')
  const busy = create.isPending
  const blocked = create.error?.code === 'CHECKOUT_BLOCKED_BY_CHANGES' ? create.error : null
  const failure = describeError(blocked ? null : create.error)
  const canSubmit = !busy && name.trim() !== ''

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      title="Create New Branch"
      description={`From “${source}”`}
      initialFocus={nameRef}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!canSubmit}
            aria-busy={busy || undefined}
          >
            {busy && <LoaderCircle className={shared.spinner} />}
            Create and Check Out
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          if (!canSubmit) return
          create.mutate(name, {
            onSuccess: (_data, createdName) => {
              onCreated(createdName)
              onClose()
            }
          })
        }}
      >
        <TextField
          ref={nameRef}
          label="New branch name"
          placeholder="New branch name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (create.error) create.reset()
          }}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </form>
      {failure && (
        <p role="alert" className={shared.error}>
          {failure.message}
        </p>
      )}
      <BlockedCheckoutDialog
        branch={blocked ? (create.variables ?? null) : null}
        files={blocked?.files ?? []}
        onClose={create.reset}
      />
    </Dialog>
  )
}

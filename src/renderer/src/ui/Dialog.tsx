import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import styles from './Dialog.module.css'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** One line under the title saying what the dialog is about. */
  description?: string
  /** The body: a list, a form, whatever the dialog is for. */
  children?: React.ReactNode
  /** Usually `Button`s. Put `DialogClose` around the one that dismisses. */
  actions?: React.ReactNode
  /** What takes focus when the dialog opens — the default button. The first control otherwise. */
  initialFocus?: React.RefObject<HTMLElement | null>
}

/** A modal dialog with content, for in-window surfaces. Simple confirms stay native (ADR 0003). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  initialFocus
}: DialogProps): React.JSX.Element {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup} initialFocus={initialFocus}>
          <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
          {description && (
            <BaseDialog.Description className={styles.description}>
              {description}
            </BaseDialog.Description>
          )}
          {children}
          {actions && <div className={styles.actions}>{actions}</div>}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

/** Wraps the element that closes the dialog, e.g. `<DialogClose render={<Button />}>OK</DialogClose>`. */
export const DialogClose = BaseDialog.Close

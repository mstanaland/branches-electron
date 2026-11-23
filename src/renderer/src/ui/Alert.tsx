import { useRender } from '@base-ui/react/use-render'
import { clsx } from 'clsx'
import styles from './Alert.module.css'

export type AlertVariant = 'info' | 'success'

export interface AlertProps extends useRender.ComponentProps<'div'> {
  variant?: AlertVariant
  /** A decorative `lucide-react` icon, drawn at the start. Meaning goes in the text. */
  icon?: React.ReactNode
  /** Buttons under the message. */
  actions?: React.ReactNode
  /** A title for the alert. */
  heading?: React.ReactNode
}

/**
 * A panel of information that sits in the page flow, such as above a list. It has no close
 * button: it stays as long as what it describes is true. A `role="note"` by default, so
 * nothing is announced the moment it appears; pass `role="alert"` for something urgent.
 */
export function Alert({
  variant = 'info',
  icon,
  heading,
  actions,
  className,
  render,
  children,
  ...props
}: AlertProps): React.JSX.Element {
  return useRender({
    defaultTagName: 'div',
    render,
    props: {
      role: 'note',
      'data-variant': variant,
      className: clsx(styles.alert, className),
      ...props,
      children: (
        <>
          {icon !== undefined && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}

          {heading ? <div className={styles.heading}>{heading}</div> : null}

          <div className={styles.body}>
            <div className={styles.message}>{children}</div>
          </div>

          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </>
      )
    }
  })
}

import styles from './Kbd.module.css'

export interface KbdProps {
  /** The keys, as the Mac shows them, e.g. `⌘↵`. */
  children: React.ReactNode
  className?: string
}

/**
 * A keyboard shortcut hint beside the control it belongs to. Hidden from screen readers:
 * every use so far sits inside a control that already names the action, so announcing the
 * symbols would only say it twice. Give it a label when one stands on its own.
 */
export function Kbd({ children, className }: KbdProps): React.JSX.Element {
  return (
    <kbd className={className ? `${styles.kbd} ${className}` : styles.kbd} aria-hidden>
      {children}
    </kbd>
  )
}

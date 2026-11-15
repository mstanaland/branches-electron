import styles from './Kbd.module.css'

export interface KbdProps {
  /** The keys, as the Mac shows them, e.g. `⌘↵`. */
  children: React.ReactNode
  /**
   * Spelled out for screen readers, e.g. "Command Enter". Without it the symbols are hidden,
   * which is right when the shortcut only repeats what the control beside it already says.
   */
  label?: string
  className?: string
}

/** A keyboard shortcut hint. Decorative unless given a `label`. */
export function Kbd({ children, label, className }: KbdProps): React.JSX.Element {
  return (
    <kbd
      className={className ? `${styles.kbd} ${className}` : styles.kbd}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {children}
    </kbd>
  )
}

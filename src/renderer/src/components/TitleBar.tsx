import styles from './TitleBar.module.css'

/**
 * The **title bar**: the full-width row at the top of the window, with the traffic lights
 * inset on the left and the **operations area** on the right, where the operations on the
 * **active repository** — Fetch, Pull, Push and the overflow menu — live.
 *
 * The row is the window's drag region, which is what makes the chrome behave like a Mac
 * window's own: the operations are excluded from it in CSS, because a control under a drag
 * region never sees the click. The window has no frame of its own (`titleBarStyle:
 * 'hiddenInset'`), so this row and the tab strip below it are all the chrome there is.
 *
 * The name of what is on screen is the **window title**, set in main from the focused tab's
 * repository, rather than text drawn here: Mission Control, the Window menu and screen
 * sharing read that, and a label in the row would not reach them.
 */
export function TitleBar(): React.JSX.Element {
  return (
    <div className={styles.titlebar}>
      <div className={styles.operations} />
    </div>
  )
}

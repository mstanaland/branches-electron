import { ArrowDownToLine, LoaderCircle } from 'lucide-react'
import { describeError, useFetchRepository, useRepositories, useTabs } from '../data'
import { Button, Tooltip } from '../ui'
import styles from './TitleBar.module.css'

/**
 * The **title bar**: the full-width row at the top of the window, with the traffic lights
 * inset on the left and the **operations area** on the right, where the operations on the
 * **active repository** — Fetch today, Pull, Push and the overflow menu as they arrive —
 * live.
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
  const { focused } = useTabs()
  const repositories = useRepositories()
  const root = focused?.root ?? null
  // A **missing repository** has no folder to fetch into, so the operation is disabled there
  // too, rather than failing with git's own words beside the tab's explanation of why.
  const reachable =
    root !== null && repositories.data?.some((r) => r.root === root && r.missing) !== true

  return (
    <div className={styles.titlebar}>
      <div className={styles.operations}>
        {/* A Repositories tab and the backdrop have no repository, so the operations have
            nothing to act on: the control is still there, visibly disabled, rather than
            appearing and disappearing as tabs change. */}
        {root !== null && reachable ? <Fetch key={root} root={root} /> : <FetchButton disabled />}
      </div>
    </div>
  )
}

/**
 * The **manual fetch** control. It reports what went wrong next to itself, unlike the
 * background fetch, which is silent by design. Keyed by root above, so switching tab never
 * shows one repository's failure beside another's; a fetch still in flight is still shown as
 * one, because that is read from the query client rather than from this mount.
 */
function Fetch({ root }: { root: string }): React.JSX.Element {
  const fetch = useFetchRepository(root)
  const error = describeError(fetch.error)

  return (
    <>
      {error && (
        // Git's messages run long, so the row shows as much as fits and the tooltip the rest.
        <Tooltip content={error.message}>
          <p role="alert" className={styles.error}>
            {error.message}
          </p>
        </Tooltip>
      )}
      {/* A fetch in flight both disables the button and spins its icon, so it can't be fired
          twice at once and says that it is working. */}
      <FetchButton busy={fetch.busy} onClick={fetch.start} />
    </>
  )
}

function FetchButton({
  busy = false,
  disabled = false,
  onClick
}: {
  busy?: boolean
  disabled?: boolean
  onClick?: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="quiet"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={onClick}
    >
      {busy ? <LoaderCircle className={styles.spinner} /> : <ArrowDownToLine />}
      Fetch
    </Button>
  )
}

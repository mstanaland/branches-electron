import {
  ArrowDownToDot,
  ArrowDownToLine,
  ArrowUpFromDot,
  CloudUpload,
  LoaderCircle
} from 'lucide-react'
import { useState } from 'react'
import type { PublishableTarget, PublishTarget, RepositoryStatus } from '../../../shared/git'
import {
  describeError,
  type RepositoryPull,
  type RepositoryPush,
  useFetchRepository,
  usePublishTarget,
  usePullRepository,
  usePushRepository,
  useRepositories,
  useStatus,
  useTabs
} from '../data'
import { Button, Tooltip } from '../ui'
import { PublishBranchDialog } from './PublishBranchDialog'
import shared from './shared.module.css'
import styles from './TitleBar.module.css'

/**
 * The **title bar**: the full-width row at the top of the window, with the traffic lights
 * inset on the left and the **operations area** on the right, where the operations on the
 * **active repository** — Fetch, Pull and Push today, the overflow menu when it arrives —
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
            nothing to act on: the controls are still there, visibly disabled, rather than
            appearing and disappearing as tabs change. */}
        {root !== null && reachable ? (
          <Operations key={root} root={root} />
        ) : (
          <>
            <FetchButton disabled />
            <PullButton disabled />
            <PushButton label="Push" disabled />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The operations on one repository. Keyed by root above, so switching tab never shows one
 * repository's failure beside another's; an operation still in flight is still shown as one,
 * because that is read from the query client rather than from this mount.
 */
function Operations({ root }: { root: string }): React.JSX.Element {
  const fetch = useFetchRepository(root)
  const pull = usePullRepository(root)
  const push = usePushRepository(root)
  // The row has space for one failure and holds several operations, so the one reported is
  // the one the user ran most recently. Without that, a fetch that succeeds after a failed
  // pull would leave the pull's error sitting there, and vice versa.
  const latest = [fetch, pull, push].reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a))
  const error = describeError(latest.error)

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
      {/* An operation in flight both disables its button and spins its icon, so it can't be
          fired twice at once and says that it is working. */}
      <FetchButton busy={fetch.busy} onClick={fetch.start} />
      <Pull root={root} pull={pull} />
      <Push root={root} push={push} />
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
      {busy ? <LoaderCircle className={shared.spinner} /> : <ArrowDownToLine />}
      Fetch
    </Button>
  )
}

/**
 * The **Pull** control. It is enabled only when there is something to fast-forward onto: a
 * **current branch** (not a **detached HEAD**) with an **upstream** it is behind.
 *
 * The count beside the label is how far behind that branch is, so the row says what pulling
 * would bring rather than only offering to do it. The number comes from status, which the
 * **background fetch** keeps current while the window is focused — so "nothing to pull" is
 * as fresh as the last fetch, and Fetch sits next to it for when it isn't.
 */
function Pull({ root, pull }: { root: string; pull: RepositoryPull }): React.JSX.Element {
  const status = useStatus(root).data
  // Everything that makes a pull impossible collapses into "nothing to fast-forward": no
  // status read yet, a **detached HEAD**, no **upstream**, or a branch already level with it.
  const behind =
    status !== undefined && !status.detached && status.upstream !== null ? status.behind : 0

  return (
    <PullButton behind={behind} busy={pull.busy} disabled={behind === 0} onClick={pull.start} />
  )
}

function PullButton({
  behind = 0,
  busy = false,
  disabled = false,
  onClick
}: {
  behind?: number
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
      {busy ? <LoaderCircle className={shared.spinner} /> : <ArrowDownToDot />}
      Pull
      {/* Part of the button's accessible name, not an aside: "Pull 3" is what the control
          offers to do, and a screen reader should hear the number too. */}
      {behind > 0 && <span className={styles.count}>{behind}</span>}
    </Button>
  )
}

/** What the Push control offers, from the current branch's status and where it can go. */
type PushOffer =
  | { kind: 'push'; ahead: number; enabled: boolean }
  /** No upstream, or a gone one: the control reads Publish and opens the dialog. */
  | { kind: 'publish'; target: PublishableTarget }

function pushOffer(
  status: RepositoryStatus | undefined,
  target: PublishTarget | undefined
): PushOffer {
  // Nothing read yet, or a **detached HEAD**: there is no branch to push.
  if (status === undefined || status.detached) return { kind: 'push', ahead: 0, enabled: false }
  if (target === undefined || target.branch === null) {
    // Where else the branch could go is still being read. A branch with an upstream can be
    // pushed regardless, so the control doesn't flash disabled on every load; one without
    // waits, since it may read Publish.
    return status.upstream === null
      ? { kind: 'push', ahead: 0, enabled: false }
      : { kind: 'push', ahead: status.ahead, enabled: status.ahead > 0 }
  }
  // With no remote at all there is nowhere to publish to either. Push stays enabled so the
  // user hears why — and Publish Repository (#46) will start from here.
  if (target.remotes.length === 0) return { kind: 'push', ahead: 0, enabled: true }
  if (status.upstream === null || target.goneFrom !== null) {
    return { kind: 'publish', target: { ...target, branch: target.branch } }
  }
  // Diverged branches stay enabled: the push is refused, and the refusal says what to do.
  return { kind: 'push', ahead: status.ahead, enabled: status.ahead > 0 }
}

/**
 * The **Push** control. With an **upstream** it pushes, showing how far **ahead** the branch
 * is and disabled when that is nothing. With no upstream, or one that is **gone**, the same
 * control reads **Publish** and opens the Publish Branch dialog instead.
 *
 * The ahead count is as fresh as the last fetch, like Pull's behind count.
 */
function Push({ root, push }: { root: string; push: RepositoryPush }): React.JSX.Element {
  const status = useStatus(root).data
  const target = usePublishTarget(root).data
  const [publishing, setPublishing] = useState(false)
  const offer = pushOffer(status, target)

  if (offer.kind === 'publish' || publishing) {
    return (
      <>
        <PushButton
          label="Publish"
          disabled={publishing}
          onClick={() => {
            setPublishing(true)
          }}
        />
        {publishing && offer.kind === 'publish' && (
          <PublishBranchDialog
            root={root}
            target={offer.target}
            onClose={() => setPublishing(false)}
          />
        )}
      </>
    )
  }

  return (
    <PushButton
      label="Push"
      ahead={offer.ahead}
      busy={push.busy}
      disabled={!offer.enabled}
      onClick={push.start}
    />
  )
}

function PushButton({
  label,
  ahead = 0,
  busy = false,
  disabled = false,
  onClick
}: {
  label: 'Push' | 'Publish'
  ahead?: number
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
      {busy ? (
        <LoaderCircle className={shared.spinner} />
      ) : label === 'Publish' ? (
        <CloudUpload />
      ) : (
        <ArrowUpFromDot />
      )}
      {label}
      {/* Part of the accessible name, as on Pull: "Push 2" is what the control offers. */}
      {ahead > 0 && <span className={styles.count}>{ahead}</span>}
    </Button>
  )
}

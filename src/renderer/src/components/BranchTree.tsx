import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import { useEffect, useId, useMemo } from 'react'
import { ApiError } from '../../../shared/apiError'
import type { BranchTreeNode } from '../../../shared/branchTree'
import { buildBranchTree, containsCurrentBranch } from '../../../shared/branchTree'
import type { Branch } from '../../../shared/git'
import { shortOid } from '../../../shared/oid'
import type { FolderExpansion, View } from '../data'
import { useTreeNavigation } from './useTreeNavigation'
import type { TreeNavigation } from './useTreeNavigation'
import {
  WORKING,
  describeError,
  isSameView,
  useBranches,
  useBranchMenu,
  useCheckoutBranch,
  useFolderExpansion,
  useSelection,
  useStatus
} from '../data'
import { BlockedCheckoutDialog } from './BlockedCheckoutDialog'
import { AheadBehind, Badge, aheadBehindLabel } from '../ui'
import shared from './shared.module.css'
import styles from './BranchTree.module.css'

interface LevelProps {
  level: number
  /** Path of the folder these items are in, or null at the top. */
  parentPath: string | null
  expansion: FolderExpansion
  navigation: TreeNavigation
  actions: BranchActions
}

/** What the tree does with a branch, and which one it is busy with. */
interface BranchActions {
  /** Name of the branch being checked out, or null. */
  checkingOut: string | null
  checkout: (name: string) => void
  /** Opens the native context menu for the branch. */
  showMenu: (name: string) => void
  /** Shows this view in the main pane. Selecting never moves HEAD (ADR 0006). */
  select: (view: View) => void
  /** Whether this view is the one on screen. */
  isSelected: (view: View) => boolean
}

function BranchRow({
  node,
  level,
  parentPath,
  navigation,
  actions
}: LevelProps & { node: BranchTreeNode }): React.JSX.Element {
  const branch = node.branch as Branch
  const view: View = { kind: 'branch', name: branch.name }
  const selected = actions.isSelected(view)
  const markersId = useId()
  const aheadBehind = aheadBehindLabel(branch.ahead, branch.behind)
  const description = [aheadBehind, branch.upstreamGone ? 'Upstream gone' : null]
    .filter((part) => part !== null)
    .join(', ')

  return (
    <li
      role="treeitem"
      aria-label={branch.name}
      aria-level={level}
      aria-current={branch.isCurrent ? 'true' : undefined}
      aria-selected={selected}
      aria-describedby={description ? markersId : undefined}
      aria-busy={actions.checkingOut === branch.name ? 'true' : undefined}
      className={styles.item}
      onClick={() => actions.select(view)}
      onDoubleClick={() => actions.checkout(branch.name)}
      onContextMenu={(event) => {
        event.preventDefault()
        actions.showMenu(branch.name)
      }}
      {...navigation.itemProps(node, parentPath)}
    >
      <div className={styles.row} data-selected={selected ? 'true' : undefined}>
        <span className={styles.chevron} aria-hidden="true" />
        <span className={branch.isCurrent ? styles.currentName : styles.name}>{node.name}</span>
        {actions.checkingOut === branch.name && (
          <LoaderCircle role="img" aria-label="Checking out" className={styles.spinner} />
        )}
        {description && (
          <span className={styles.markers}>
            {/* What screen readers hear; the visible badges below are for sighted users. */}
            <span id={markersId} hidden>
              {description}
            </span>
            <AheadBehind ahead={branch.ahead} behind={branch.behind} />
            {branch.upstreamGone && (
              <Badge variant="destructive" role="img" aria-label="Upstream gone">
                gone
              </Badge>
            )}
          </span>
        )}
        {/* Where HEAD is. `aria-current` above already says it, so this is decorative. */}
        {branch.isCurrent && <Badge aria-hidden="true">HEAD</Badge>}
      </div>
    </li>
  )
}

function FolderRow({
  node,
  level,
  parentPath,
  expansion,
  navigation,
  actions
}: LevelProps & { node: BranchTreeNode }): React.JSX.Element {
  const expanded = expansion.isExpanded(node.path)

  return (
    <li
      role="treeitem"
      aria-label={node.path}
      aria-level={level}
      aria-expanded={expanded}
      className={styles.item}
      {...navigation.itemProps(node, parentPath)}
    >
      <div className={styles.row} onClick={() => expansion.setExpanded(node.path, !expanded)}>
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </span>
        <span className={styles.name}>{node.name}</span>
        {/* Collapsed, the folder stands in for the current branch hidden inside it. */}
        {!expanded && containsCurrentBranch(node) && (
          <Badge role="img" aria-label="Contains the current branch">
            HEAD
          </Badge>
        )}
      </div>
      {expanded && (
        <TreeLevel
          nodes={node.children}
          level={level + 1}
          parentPath={node.path}
          expansion={expansion}
          navigation={navigation}
          actions={actions}
        />
      )}
    </li>
  )
}

/**
 * HEAD when it isn't on a branch. A node of its own rather than a fake branch, so it joins
 * the arrow-key order without anything else in the app having to treat it as a branch.
 * There is no checkout for it and nothing in its context menu, so it has neither.
 */
function DetachedRow({
  node,
  oid,
  navigation,
  actions
}: {
  node: BranchTreeNode
  oid: string
  navigation: TreeNavigation
  actions: BranchActions
}): React.JSX.Element {
  const view: View = { kind: 'detached', oid }
  const selected = actions.isSelected(view)

  return (
    <li
      role="treeitem"
      aria-label={`Detached HEAD at ${node.name}`}
      aria-level={1}
      aria-current="true"
      aria-selected={selected}
      className={styles.item}
      onClick={() => actions.select(view)}
      {...navigation.itemProps(node, null)}
    >
      <div className={styles.row} data-selected={selected ? 'true' : undefined}>
        <span className={styles.chevron} aria-hidden="true" />
        <span className={styles.detachedOid}>{node.name}</span>
        <Badge aria-hidden="true">HEAD</Badge>
      </div>
    </li>
  )
}

/** One level of the tree. The top level is the `tree`; nested levels are `group`s. */
function TreeLevel({
  nodes,
  detachedOid,
  ...props
}: LevelProps & {
  nodes: BranchTreeNode[]
  /** Oid of the detached HEAD node in `nodes`, if there is one. */
  detachedOid?: string
}): React.JSX.Element {
  const isRoot = props.parentPath === null
  return (
    <ul
      role={isRoot ? 'tree' : 'group'}
      aria-label={isRoot ? 'Branches' : undefined}
      className={isRoot ? styles.tree : styles.group}
    >
      {nodes.map((node) => {
        if (node.path === DETACHED_PATH && detachedOid !== undefined) {
          return <DetachedRow key={node.path} node={node} oid={detachedOid} {...props} />
        }
        return node.branch ? (
          <BranchRow key={node.path} node={node} {...props} />
        ) : (
          <FolderRow key={node.path} node={node} {...props} />
        )
      })}
    </ul>
  )
}

/**
 * Path of the detached-HEAD node. A colon can't appear in a branch name, so it can never
 * collide with one.
 */
const DETACHED_PATH = ':detached'

/** The active repository's local branches, grouped into folders by "/" in their names. */
export function BranchTree({ root }: { root: string }): React.JSX.Element | null {
  const branches = useBranches(root)
  const status = useStatus(root)
  const expansion = useFolderExpansion(root)
  const checkout = useCheckoutBranch(root)
  const menu = useBranchMenu(root)
  const { view, setView } = useSelection()
  const headingId = useId()

  const detachedOid = status.data?.detached ? (status.data.headOid ?? null) : null
  const tree = useMemo(() => {
    const branchNodes = buildBranchTree(branches.data ?? [])
    if (detachedOid === null) return branchNodes
    // Above every branch and folder: it is where HEAD is, and it is the shortest-lived row
    // in the list, so it shouldn't be hunted for.
    const detached: BranchTreeNode = {
      name: shortOid(detachedOid),
      path: DETACHED_PATH,
      branch: null,
      children: []
    }
    return [detached, ...branchNodes]
  }, [branches.data, detachedOid])

  const checkingOut = checkout.isPending ? checkout.variables : null
  const actions: BranchActions = {
    checkingOut,
    checkout: (name) => {
      // The current branch needs no switch; a second switch waits until this one is done.
      if (checkingOut !== null || name === status.data?.branch) return
      // Landing on a branch and still being shown another one would read as a bug, so our
      // own checkout selects what it checked out. HEAD moving any other way doesn't.
      setView({ kind: 'branch', name })
      checkout.mutate(name)
    },
    showMenu: (name) =>
      menu.mutate(name, {
        onSuccess: (choice) => {
          if (choice === 'checkout') actions.checkout(name)
        }
      }),
    select: setView,
    isSelected: (candidate) => isSameView(view, candidate)
  }
  const navigation = useTreeNavigation(tree, expansion, (node) => {
    if (node.path === DETACHED_PATH && detachedOid !== null) {
      setView({ kind: 'detached', oid: detachedOid })
    } else if (node.branch) {
      setView({ kind: 'branch', name: node.branch.name })
    }
  })

  // A branch can be deleted or renamed, and a detached HEAD ends the moment something is
  // checked out — in a terminal as easily as here. Rather than show history of something
  // that is gone, fall back to the view that always exists. Only once the list has loaded:
  // while it is undefined nothing is known to be missing.
  const listed = branches.data
  useEffect(() => {
    if (listed === undefined) return
    if (view.kind === 'branch' && !listed.some((branch) => branch.name === view.name)) {
      setView(WORKING)
    }
    if (view.kind === 'detached' && view.oid !== detachedOid) setView(WORKING)
  }, [listed, view, detachedOid, setView])

  const blocked =
    checkout.error instanceof ApiError && checkout.error.code === 'CHECKOUT_BLOCKED_BY_CHANGES'
      ? checkout.error
      : null
  const error = describeError(
    branches.error ?? status.error ?? (blocked ? null : checkout.error) ?? menu.error
  )
  // "Repository not found" is the main pane's job; the tree just stays out of the way.
  if (error?.notARepository) return null

  return (
    <section className={styles.branches} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        Branches
      </h2>
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
      {branches.data?.length === 0 && detachedOid === null && (
        <p className={styles.empty}>No branches yet.</p>
      )}
      {tree.length > 0 && (
        <TreeLevel
          nodes={tree}
          detachedOid={detachedOid ?? undefined}
          level={1}
          parentPath={null}
          expansion={expansion}
          navigation={navigation}
          actions={actions}
        />
      )}
      <BlockedCheckoutDialog
        branch={blocked ? (checkout.variables ?? null) : null}
        files={blocked?.files ?? []}
        onClose={checkout.reset}
      />
    </section>
  )
}

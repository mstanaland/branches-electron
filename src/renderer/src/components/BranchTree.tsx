import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import { useId, useMemo } from 'react'
import { ApiError } from '../../../shared/apiError'
import type { BranchTreeNode } from '../../../shared/branchTree'
import { buildBranchTree, containsCurrentBranch } from '../../../shared/branchTree'
import type { Branch } from '../../../shared/git'
import type { FolderExpansion } from '../data'
import { useTreeNavigation } from './useTreeNavigation'
import type { TreeNavigation } from './useTreeNavigation'
import {
  describeError,
  useBranches,
  useBranchMenu,
  useCheckoutBranch,
  useFolderExpansion,
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
}

function BranchRow({
  node,
  level,
  parentPath,
  navigation,
  actions
}: LevelProps & { node: BranchTreeNode }): React.JSX.Element {
  const branch = node.branch as Branch
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
      aria-describedby={description ? markersId : undefined}
      aria-busy={actions.checkingOut === branch.name ? 'true' : undefined}
      className={styles.item}
      onDoubleClick={() => actions.checkout(branch.name)}
      onContextMenu={(event) => {
        event.preventDefault()
        actions.showMenu(branch.name)
      }}
      {...navigation.itemProps(node, parentPath)}
    >
      <div className={styles.row}>
        <span className={styles.chevron} aria-hidden="true">
          {branch.isCurrent && <span className={styles.currentDot} />}
        </span>
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
        {!expanded && containsCurrentBranch(node) && (
          <span role="img" aria-label="Contains current branch" className={styles.currentDot} />
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

/** One level of the tree. The top level is the `tree`; nested levels are `group`s. */
function TreeLevel({
  nodes,
  ...props
}: LevelProps & { nodes: BranchTreeNode[] }): React.JSX.Element {
  const isRoot = props.parentPath === null
  return (
    <ul
      role={isRoot ? 'tree' : 'group'}
      aria-label={isRoot ? 'Branches' : undefined}
      className={isRoot ? styles.tree : styles.group}
    >
      {nodes.map((node) =>
        node.branch ? (
          <BranchRow key={node.path} node={node} {...props} />
        ) : (
          <FolderRow key={node.path} node={node} {...props} />
        )
      )}
    </ul>
  )
}

/** The active repository's local branches, grouped into folders by "/" in their names. */
export function BranchTree({ root }: { root: string }): React.JSX.Element | null {
  const branches = useBranches(root)
  const status = useStatus(root)
  const expansion = useFolderExpansion(root)
  const tree = useMemo(() => buildBranchTree(branches.data ?? []), [branches.data])
  const checkout = useCheckoutBranch(root)
  const menu = useBranchMenu(root)

  const checkingOut = checkout.isPending ? checkout.variables : null
  const actions: BranchActions = {
    checkingOut,
    checkout: (name) => {
      // The current branch needs no switch; a second switch waits until this one is done.
      if (checkingOut !== null || name === status.data?.branch) return
      checkout.mutate(name)
    },
    showMenu: (name) =>
      menu.mutate(name, {
        onSuccess: (choice) => {
          if (choice === 'checkout') actions.checkout(name)
        }
      })
  }
  const navigation = useTreeNavigation(tree, expansion, actions.checkout)

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
    <section className={styles.branches} aria-label="Branches">
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
      {status.data?.detached && (
        <p className={styles.detached}>Detached at {status.data.headOid}</p>
      )}
      {branches.data?.length === 0 && <p className={styles.empty}>No branches yet.</p>}
      {tree.length > 0 && (
        <TreeLevel
          nodes={tree}
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

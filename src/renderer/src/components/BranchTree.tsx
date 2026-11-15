import { useId, useMemo } from 'react'
import type { BranchTreeNode } from '../../../shared/branchTree'
import { buildBranchTree, containsCurrentBranch } from '../../../shared/branchTree'
import type { Branch } from '../../../shared/git'
import type { FolderExpansion } from '../data'
import { useTreeNavigation } from './useTreeNavigation'
import type { TreeNavigation } from './useTreeNavigation'
import { describeError, useBranches, useFolderExpansion, useStatus } from '../data'
import styles from './BranchTree.module.css'

/** "2 ahead, 1 behind", or null when the branch is level with its upstream. */
function aheadBehindLabel(branch: Branch): string | null {
  const parts = [
    branch.ahead > 0 ? `${branch.ahead} ahead` : null,
    branch.behind > 0 ? `${branch.behind} behind` : null
  ].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(', ') : null
}

interface LevelProps {
  level: number
  /** Path of the folder these items are in, or null at the top. */
  parentPath: string | null
  expansion: FolderExpansion
  navigation: TreeNavigation
}

function BranchRow({
  node,
  level,
  parentPath,
  navigation
}: LevelProps & { node: BranchTreeNode }): React.JSX.Element {
  const branch = node.branch as Branch
  const markersId = useId()
  const aheadBehind = aheadBehindLabel(branch)
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
      className={styles.item}
      {...navigation.itemProps(node, parentPath)}
    >
      <div className={styles.row}>
        <span className={styles.chevron} aria-hidden="true">
          {branch.isCurrent && <span className={styles.currentMark} />}
        </span>
        <span className={branch.isCurrent ? styles.currentName : styles.name}>{node.name}</span>
        {description && (
          <span className={styles.markers}>
            {/* What screen readers hear; the visible badges below are for sighted users. */}
            <span id={markersId} hidden>
              {description}
            </span>
            {aheadBehind !== null && (
              <span role="img" aria-label={aheadBehind} className={styles.counts}>
                {branch.ahead > 0 && `↑${branch.ahead}`}
                {branch.ahead > 0 && branch.behind > 0 && ' '}
                {branch.behind > 0 && `↓${branch.behind}`}
              </span>
            )}
            {branch.upstreamGone && (
              <span role="img" aria-label="Upstream gone" className={styles.gone}>
                gone
              </span>
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
  navigation
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
          {expanded ? '▾' : '▸'}
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
  const navigation = useTreeNavigation(tree, expansion)

  const error = describeError(branches.error ?? status.error)
  // "Repository not found" is the main pane's job; the tree just stays out of the way.
  if (error?.notARepository) return null

  return (
    <section className={styles.branches} aria-label="Branches">
      {error && (
        <p role="alert" className={styles.error}>
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
        />
      )}
    </section>
  )
}

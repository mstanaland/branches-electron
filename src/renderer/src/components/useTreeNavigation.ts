import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { BranchTreeNode } from '../../../shared/branchTree'
import type { FolderExpansion } from '../data'

export interface TreeItemProps {
  ref: (element: HTMLElement | null) => void
  tabIndex: number
  onFocus: (event: React.FocusEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export interface TreeNavigation {
  /** Spread onto a node's `treeitem` element. `parentPath` is its folder's path, or null. */
  itemProps: (node: BranchTreeNode, parentPath: string | null) => TreeItemProps
}

/** The nodes a user can currently reach, in screen order: children of collapsed folders are out. */
function visibleNodes(nodes: BranchTreeNode[], expansion: FolderExpansion): BranchTreeNode[] {
  return nodes.flatMap((node) =>
    node.branch || !expansion.isExpanded(node.path)
      ? [node]
      : [node, ...visibleNodes(node.children, expansion)]
  )
}

/**
 * Keyboard behavior for a tree (WAI-ARIA tree pattern): the tree is one Tab stop, Up/Down move
 * through visible items, Right expands or steps into a folder, Left collapses or steps out.
 */
export function useTreeNavigation(
  tree: BranchTreeNode[],
  expansion: FolderExpansion,
  /** Called with a leaf when the user presses Enter or Space on it: a branch, or the
   * detached-HEAD row. Selecting, not checking out — see ADR 0006. */
  onSelect: (node: BranchTreeNode) => void
): TreeNavigation {
  const elements = useRef(new Map<string, HTMLElement>())
  const [focusedPath, setFocusedPath] = useState<string | null>(null)

  const visible = visibleNodes(tree, expansion)
  const tabStopPath = visible.some((node) => node.path === focusedPath)
    ? focusedPath
    : (visible[0]?.path ?? null)

  const focusPath = (path: string | undefined): void => {
    if (path !== undefined) elements.current.get(path)?.focus()
  }

  return {
    itemProps: (node, parentPath) => ({
      ref: (element) => {
        if (element) elements.current.set(node.path, element)
        else elements.current.delete(node.path)
      },
      tabIndex: node.path === tabStopPath ? 0 : -1,
      onFocus: (event) => {
        // Focus events bubble from nested items; only the item itself is the tab stop.
        if (event.target === event.currentTarget) setFocusedPath(node.path)
      },
      onKeyDown: (event) => {
        if (event.target !== event.currentTarget) return
        // A folder is the only node with children. The detached-HEAD row has neither a
        // branch nor children, and behaves as a leaf.
        const isFolder = node.branch === null && node.children.length > 0
        const index = visible.findIndex((candidate) => candidate.path === node.path)
        let handled = true

        switch (event.key) {
          case 'ArrowDown':
            focusPath(visible[index + 1]?.path)
            break
          case 'ArrowUp':
            focusPath(visible[index - 1]?.path)
            break
          case 'ArrowRight':
            if (!isFolder) break
            if (!expansion.isExpanded(node.path)) expansion.setExpanded(node.path, true)
            else focusPath(node.children[0]?.path)
            break
          case 'ArrowLeft':
            if (isFolder && expansion.isExpanded(node.path)) expansion.setExpanded(node.path, false)
            else if (parentPath !== null) focusPath(parentPath)
            break
          case 'Enter':
          case ' ':
            if (isFolder) expansion.setExpanded(node.path, !expansion.isExpanded(node.path))
            else onSelect(node)
            break
          default:
            handled = false
        }
        if (handled) event.preventDefault()
      }
    })
  }
}

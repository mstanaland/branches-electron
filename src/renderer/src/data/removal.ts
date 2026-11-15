import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { keys } from './keys'
import { useSelection } from './selection'

/**
 * What to do once main has answered whether it removed `root` from the saved list:
 * drop its cached git state, un-activate it, and refresh the list.
 */
function useAfterRemoval(): (root: string, removed: boolean) => Promise<void> {
  const queryClient = useQueryClient()
  const { activeRoot, setActiveRoot } = useSelection()

  return async (root, removed) => {
    if (!removed) return
    if (activeRoot === root) setActiveRoot(null)
    queryClient.removeQueries({ queryKey: keys.repository(root) })
    await queryClient.invalidateQueries({ queryKey: keys.repositories() })
  }
}

/** Pops up the native context menu for a saved repository; "Remove from List" removes it. */
export function useRepositoryMenu() {
  const afterRemoval = useAfterRemoval()
  return useMutation({
    mutationFn: (root: string) => api.showRepositoryMenu(root),
    onSuccess: (removed, root) => afterRemoval(root, removed)
  })
}

/** Asks (natively) whether to remove a saved repository whose folder is gone. */
export function useConfirmRemoveMissing() {
  const afterRemoval = useAfterRemoval()
  return useMutation({
    mutationFn: (root: string) => api.confirmRemoveMissingRepository(root),
    onSuccess: (removed, root) => afterRemoval(root, removed)
  })
}

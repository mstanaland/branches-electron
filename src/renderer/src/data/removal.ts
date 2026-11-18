import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { keys } from './keys'
import { useTabs } from './tabs'

/**
 * What to do once main has answered whether it removed `root` from the saved list: drop its
 * cached git state, close any tab showing it — no tab points at a repository the app has
 * forgotten — and refresh the list.
 */
function useAfterRemoval(): (root: string, removed: boolean) => Promise<void> {
  const queryClient = useQueryClient()
  const { closeRepository } = useTabs()

  return async (root, removed) => {
    if (!removed) return
    closeRepository(root)
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

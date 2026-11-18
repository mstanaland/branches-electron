import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { ApiError } from '../../../shared/apiError'
import { keys } from './keys'

/** Switches the repository to a local branch, then refreshes its status and branches. */
export function useCheckoutBranch(root: string) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: (name) => api.checkoutBranch(root, name),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.status(root) }),
        queryClient.invalidateQueries({ queryKey: keys.branches(root) }),
        // A different current branch has different places to go.
        queryClient.invalidateQueries({ queryKey: keys.publishTarget(root) }),
        queryClient.invalidateQueries({ queryKey: keys.diffs(root) })
      ])
    }
  })
}

/**
 * Pops up the native context menu for a branch. It resolves with the user's choice
 * ('checkout', or null if they dismissed it); acting on it is the caller's job.
 */
export function useBranchMenu(root: string) {
  return useMutation({ mutationFn: (name: string) => api.showBranchMenu(root, name) })
}

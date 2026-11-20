import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { ApiError } from '../../../shared/apiError'
import { keys } from './keys'

function invalidateAfterCheckout(client: QueryClient, root: string): Promise<void[]> {
  return Promise.all([
    client.invalidateQueries({ queryKey: keys.status(root) }),
    client.invalidateQueries({ queryKey: keys.branches(root) }),
    // A different current branch has different places to go.
    client.invalidateQueries({ queryKey: keys.publishTarget(root) }),
    client.invalidateQueries({ queryKey: keys.diffs(root) })
  ])
}

/** Switches the repository to a local branch, then refreshes its status and branches. */
export function useCheckoutBranch(root: string) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: (name) => api.checkoutBranch(root, name),
    onSuccess: () => invalidateAfterCheckout(queryClient, root)
  })
}

export function useCreateBranch(root: string, source: string) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: (name) => api.createBranch(root, source, name),
    onSettled: async (_data, error, name) => {
      // A post-checkout hook can fail after Git has already switched branches.
      await Promise.all([
        invalidateAfterCheckout(queryClient, root),
        !error && queryClient.invalidateQueries({ queryKey: keys.commits(root, name) })
      ])
    }
  })
}

/**
 * Pops up the native context menu for a branch. It resolves with the user's choice
 * (or null if they dismissed it); acting on it is the caller's job.
 */
export function useBranchMenu(root: string) {
  return useMutation({ mutationFn: (name: string) => api.showBranchMenu(root, name) })
}

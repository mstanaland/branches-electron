import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import type { BranchDeletion } from '../../../shared/git'
import { api } from '../api'
import { keys } from './keys'

/**
 * What deleting `name` would lose — its **branch-only commits** and a **gone** upstream —
 * read once when the Delete Branch dialog opens and dropped when it closes, so every opening
 * counts afresh (ADR 0009).
 */
export function useBranchDeletion(root: string, name: string) {
  return useQuery<BranchDeletion, ApiError>({
    queryKey: keys.branchDeletion(root, name),
    queryFn: () => api.getBranchDeletion(root, name),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false
  })
}

/** The Delete Branch operation, run from its dialog. */
export interface DeleteBranch {
  /** Deletes the branch the dialog read, if it is still at that oid. Resolves once it has. */
  deleteBranch: (deletion: BranchDeletion) => Promise<void>
  busy: boolean
  /** What the last attempt failed with, for the dialog to show. */
  error: ApiError | null
}

/**
 * **Delete branch**. A failure stays with the dialog, for a retry or a Cancel. Afterwards the
 * branch list is read again and the deleted branch's cached history dropped; HEAD and the work
 * tree are untouched, since the current branch is never deleted.
 */
export function useDeleteBranch(root: string): DeleteBranch {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, ApiError, BranchDeletion>({
    mutationFn: ({ name, oid }) => api.deleteBranch(root, name, oid),
    onSuccess: async (_result, { name }) => {
      queryClient.removeQueries({ queryKey: keys.commits(root, name) })
      await queryClient.invalidateQueries({ queryKey: keys.branches(root) })
    }
  })

  return {
    deleteBranch: (deletion) => mutation.mutateAsync(deletion),
    busy: mutation.isPending,
    error: mutation.error
  }
}

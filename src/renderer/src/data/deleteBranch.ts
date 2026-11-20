import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import type { BranchDeletion } from '../../../shared/git'
import { api } from '../api'
import { invalidateAfterFetch } from './fetch'
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

/** What the Delete Branch dialog confirms: the branch it read, and whether its upstream goes too. */
export interface DeleteBranchRequest {
  deletion: BranchDeletion
  /** Delete `deletion.deletableUpstream` from its remote first, at the oid it was read at. */
  alsoUpstream: boolean
}

/** The Delete Branch operation, run from its dialog. */
export interface DeleteBranch {
  /**
   * Deletes the branch the dialog read — and its upstream, if asked — provided neither has
   * moved since. Resolves once both are gone.
   */
  deleteBranch: (request: DeleteBranchRequest) => Promise<void>
  busy: boolean
  /** What the last attempt failed with, for the dialog to show. */
  error: ApiError | null
}

/**
 * **Delete branch**. A failure stays with the dialog, for a retry or a Cancel. Afterwards the
 * branch list is read again and the deleted branch's cached history dropped; HEAD and the work
 * tree are untouched, since the current branch is never deleted. Deleting the upstream too
 * moves remote-tracking refs, so then everything a fetch touches is read again as well —
 * another branch may track the same upstream, and the publish target may change.
 */
export function useDeleteBranch(root: string): DeleteBranch {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, ApiError, DeleteBranchRequest>({
    mutationFn: ({ deletion: { name, oid, deletableUpstream }, alsoUpstream }) =>
      api.deleteBranch(
        root,
        name,
        oid,
        alsoUpstream && deletableUpstream !== null ? deletableUpstream.oid : null
      ),
    onSuccess: async (_result, { deletion: { name }, alsoUpstream }) => {
      queryClient.removeQueries({ queryKey: keys.commits(root, name) })
      await (alsoUpstream
        ? invalidateAfterFetch(queryClient, root)
        : queryClient.invalidateQueries({ queryKey: keys.branches(root) }))
    }
  })

  return {
    deleteBranch: (request) => mutation.mutateAsync(request),
    busy: mutation.isPending,
    error: mutation.error
  }
}

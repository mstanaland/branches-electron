import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { ApiError } from '../../../shared/apiError'
import { stagingState } from '../../../shared/changes'
import type { FileChange, RepositoryStatus } from '../../../shared/git'
import { api } from '../api'
import { keys } from './keys'
import { predictStaged, predictUnstaged } from './optimisticStaging'

/** One staging request: whole changes into or out of the index. */
interface Staging {
  action: 'stage' | 'unstage'
  paths: readonly string[]
}

export interface StagingActions {
  /**
   * Stages the change, or unstages it if it is already fully staged — so the row's checkbox
   * reads as expected: empty stages, checked unstages, and partially staged stages the rest.
   */
  toggle: (change: FileChange) => void
  /** Stages every change in the repository except conflicts. */
  stageAll: () => void
  /** False when there is nothing left to stage, so "Stage All" can be disabled. */
  canStageAll: boolean
  /** The last failure, already rolled back, or null. */
  error: ApiError | null
  pending: boolean
}

/** What "Stage All" would stage: everything with an unstaged side, conflicts excluded. */
function stageableChanges(changes: readonly FileChange[]): string[] {
  return changes
    .filter(
      (change) =>
        change.kind !== 'unmerged' && change.kind !== 'ignored' && stagingState(change) !== 'staged'
    )
    .map((change) => change.path)
}

/**
 * Staging actions for one repository. `changes` is the repository's current changes, which
 * "Stage All" needs; it is passed in rather than read from the cache so the actions follow
 * the same data the list is drawn from.
 *
 * Each call updates the cached status straight away so the checkbox moves under the user's
 * hand, puts the old status back if git refuses, and then refetches the status and the diffs
 * of the paths involved, since staging moves a change between the two sides of its diff.
 */
export function useStaging(root: string, changes: readonly FileChange[]): StagingActions {
  const queryClient = useQueryClient()
  const statusKey = keys.status(root)

  const mutation = useMutation<void, ApiError, Staging, { previous: RepositoryStatus | undefined }>(
    {
      mutationFn: ({ action, paths }) =>
        action === 'stage' ? api.stageFiles(root, paths) : api.unstageFiles(root, paths),
      onMutate: async ({ action, paths }) => {
        // Stop a refetch in flight from landing on top of the optimistic status.
        await queryClient.cancelQueries({ queryKey: statusKey })
        const previous = queryClient.getQueryData<RepositoryStatus>(statusKey)
        const affected = new Set(paths)
        const predict = action === 'stage' ? predictStaged : predictUnstaged
        queryClient.setQueryData<RepositoryStatus>(statusKey, (current) =>
          current === undefined
            ? current
            : {
                ...current,
                changes: current.changes.map((change) =>
                  affected.has(change.path) ? predict(change) : change
                )
              }
        )
        return { previous }
      },
      onError: (_error, _staging, context) => {
        if (context) queryClient.setQueryData(statusKey, context.previous)
      },
      onSettled: async (_data, _error, { paths }) => {
        const affected = new Set<string>(paths)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: statusKey }),
          queryClient.invalidateQueries({
            queryKey: keys.diffs(root),
            // keys.diff(root, path, originalPath): the path is the key's fourth part.
            predicate: (query) => affected.has(query.queryKey[3] as string)
          })
        ])
      }
    }
  )

  const stageable = stageableChanges(changes)
  const { mutate } = mutation

  const toggle = useCallback(
    (change: FileChange) => {
      if (change.kind === 'unmerged') return
      const action = stagingState(change) === 'staged' ? 'unstage' : 'stage'
      mutate({ action, paths: [change.path] })
    },
    [mutate]
  )

  const stageAll = useCallback(() => {
    if (stageable.length === 0) return
    mutate({ action: 'stage', paths: stageable })
  }, [mutate, stageable])

  return {
    toggle,
    stageAll,
    canStageAll: stageable.length > 0,
    error: mutation.error,
    pending: mutation.isPending
  }
}

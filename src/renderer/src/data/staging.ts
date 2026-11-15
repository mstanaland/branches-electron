import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { ApiError } from '../../../shared/apiError'
import { isConflict, stagingState } from '../../../shared/changes'
import type { FileChange, RepositoryStatus } from '../../../shared/git'
import { api } from '../api'
import { keys } from './keys'
import { predictStaged, predictUnstaged } from './optimisticStaging'

/** One staging request: whole changes into or out of the index. */
interface Staging {
  action: 'stage' | 'unstage'
  paths: readonly string[]
}

/** The rows one request changed, as they were, so a failure puts back only those. */
interface Rollback {
  before: Map<string, FileChange>
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
  /** The last failure, already rolled back, or null. Cleared when a new request starts. */
  error: ApiError | null
}

/** The status with every change in `affected` replaced by what it will look like. */
function predicted(
  status: RepositoryStatus | undefined,
  affected: ReadonlySet<string>,
  predict: (change: FileChange) => FileChange
): RepositoryStatus | undefined {
  if (status === undefined) return status
  return {
    ...status,
    changes: status.changes.map((change) => (affected.has(change.path) ? predict(change) : change))
  }
}

/** What "Stage All" would stage: everything with an unstaged side, conflicts excluded. */
function stageableChanges(changes: readonly FileChange[]): string[] {
  return changes
    .filter(
      (change) =>
        !isConflict(change) && change.kind !== 'ignored' && stagingState(change) !== 'staged'
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
  // Held here rather than read off the mutation: one `useMutation` reports only its latest
  // call, so a failure would be hidden by whatever the user clicked next.
  const [error, setError] = useState<ApiError | null>(null)

  const mutation = useMutation<void, ApiError, Staging, Rollback>({
    mutationFn: ({ action, paths }) =>
      action === 'stage' ? api.stageFiles(root, paths) : api.unstageFiles(root, paths),
    onMutate: async ({ action, paths }) => {
      setError(null)
      // Stop a refetch in flight from landing on top of the optimistic status.
      await queryClient.cancelQueries({ queryKey: statusKey })
      const affected = new Set(paths)
      const predict = action === 'stage' ? predictStaged : predictUnstaged
      // Only the rows this request touches are remembered, so rolling it back can't also
      // undo rows another request is still waiting on.
      const before = new Map(
        (queryClient.getQueryData<RepositoryStatus>(statusKey)?.changes ?? [])
          .filter((change) => affected.has(change.path))
          .map((change) => [change.path, change] as const)
      )
      queryClient.setQueryData<RepositoryStatus>(statusKey, (status) =>
        predicted(status, affected, predict)
      )
      return { before }
    },
    onError: (failure, _staging, context) => {
      setError(failure)
      if (context === undefined) return
      queryClient.setQueryData<RepositoryStatus>(statusKey, (status) =>
        status === undefined
          ? status
          : {
              ...status,
              changes: status.changes.map((change) => context.before.get(change.path) ?? change)
            }
      )
    },
    onSettled: async (_data, _error, { paths }) => {
      const isAffectedDiff = keys.isDiffOfAny(root, paths)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statusKey }),
        queryClient.invalidateQueries({
          queryKey: keys.diffs(root),
          predicate: (query) => isAffectedDiff(query.queryKey)
        })
      ])
    }
  })

  const stageable = stageableChanges(changes)
  const { mutate } = mutation

  const toggle = useCallback(
    (change: FileChange) => {
      if (isConflict(change)) return
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
    error
  }
}

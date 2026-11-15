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

/** The two faces of the single stage-all button. */
export type StageAllLabel = 'Stage All' | 'Unstage All'

/**
 * The stage-all button, resolved: the words to show and the one thing clicking it does.
 * They travel together so the label can be reworded without changing what the click does.
 */
export interface StageAll {
  label: StageAllLabel
  run: () => void
}

export interface StagingActions {
  /**
   * Stages the change, or unstages it if it is already fully staged — so the row's checkbox
   * reads as expected: empty stages, checked unstages, and partially staged stages the rest.
   */
  toggle: (change: FileChange) => void
  /**
   * The stage-all button: it stages every change in the repository except conflicts, or
   * unstages that same set once all of it is staged. Null when there is nothing it could
   * act on — an empty repository, or one whose only changes are conflicts — so the pane
   * leaves it out rather than showing a button that would do nothing.
   */
  stageAll: StageAll | null
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

/**
 * The changes the stage-all button acts on in either direction: everything but conflicts,
 * which can't be staged as they are, and ignored files, which aren't shown.
 */
function stageAllCandidates(changes: readonly FileChange[]): FileChange[] {
  return changes.filter((change) => !isConflict(change) && change.kind !== 'ignored')
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

  const candidates = stageAllCandidates(changes)
  // What "Stage All" would stage: anything not already wholly in the index, a partially
  // staged change included, so clicking it stages the remainder.
  const stageable = candidates
    .filter((change) => stagingState(change) !== 'staged')
    .map((change) => change.path)
  // Nothing left to stage, so the button turns around and unstages the whole set. Every
  // candidate is wholly staged in that case, which is why they are all fair game.
  const unstaging = candidates.length > 0 && stageable.length === 0
  const paths = unstaging ? candidates.map((change) => change.path) : stageable
  const { mutate } = mutation

  const toggle = useCallback(
    (change: FileChange) => {
      if (isConflict(change)) return
      const action = stagingState(change) === 'staged' ? 'unstage' : 'stage'
      mutate({ action, paths: [change.path] })
    },
    [mutate]
  )

  const run = useCallback(() => {
    mutate({ action: unstaging ? 'unstage' : 'stage', paths })
  }, [mutate, unstaging, paths])

  return {
    toggle,
    stageAll: paths.length === 0 ? null : { label: unstaging ? 'Unstage All' : 'Stage All', run },
    error
  }
}

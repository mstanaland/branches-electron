import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import { api } from '../api'
import { keys } from './keys'

/** The Pull operation's state for one repository. */
export interface RepositoryPull {
  /** Starts a pull. Does nothing while one is already in flight. */
  start: () => void
  /** True while a pull of this repository is running, including one started before this mount. */
  busy: boolean
  /** What the last pull started from this mount failed with, else null. */
  error: ApiError | null
}

/**
 * **Pull**: brings the **active repository**'s **current branch** up to date with its
 * **upstream**, run from the **operations area**.
 *
 * Shaped like the **manual fetch** deliberately, down to reading `busy` from the query
 * client rather than from this mutation, so a pull stays visibly in flight — and
 * unrepeatable — across a tab switch that unmounts the control and back.
 *
 * Where it differs is what it invalidates. A fetch only moves remote-tracking refs, so it
 * re-reads branches and status; a pull moves HEAD and rewrites the work tree, so every
 * query for the repository — status, branches, histories and diffs — is stale at once.
 */
export function usePullRepository(root: string): RepositoryPull {
  const queryClient = useQueryClient()
  const mutationKey = keys.pull(root)

  const pull = useMutation<void, ApiError, void>({
    mutationKey,
    mutationFn: () => api.pullRepository(root),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.repository(root) })
  })
  const inFlight = useIsMutating({ mutationKey })

  return {
    start: () => {
      if (inFlight === 0) pull.mutate()
    },
    busy: inFlight > 0,
    error: pull.error
  }
}

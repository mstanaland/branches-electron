import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import { api } from '../api'
import { keys } from './keys'

/**
 * Re-reads what a fetch — background or manual — can have changed: the branches, and the
 * current branch's ahead/behind counts in status. Diffs come from the work tree and the
 * index, which a fetch never touches. One rule, in one place, for both callers.
 */
export async function invalidateAfterFetch(client: QueryClient, root: string): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.branches(root) }),
    client.invalidateQueries({ queryKey: keys.status(root) })
  ])
}

/** The Fetch operation's state for one repository. */
export interface RepositoryFetch {
  /** Starts a fetch. Does nothing while one is already in flight. */
  start: () => void
  /** True while a fetch of this repository is running, including one started before this mount. */
  busy: boolean
  /** What the last fetch started from this mount failed with, else null. */
  error: ApiError | null
}

/**
 * The **manual fetch**: the Fetch operation in the title bar, run against the **active
 * repository** on demand rather than waiting for the background fetch's next tick.
 *
 * It is the loud one. The background fetch swallows its failures by design, but a fetch the
 * user asked for that silently did nothing is worse than no button, so the error comes back
 * here for the title bar to show.
 *
 * `busy` comes from the query client rather than from this mutation, so a fetch stays visibly
 * in flight — and unrepeatable — across a tab switch that unmounts the control and back.
 */
export function useFetchRepository(root: string): RepositoryFetch {
  const queryClient = useQueryClient()
  const mutationKey = keys.fetch(root)

  const fetch = useMutation<void, ApiError, void>({
    mutationKey,
    mutationFn: () => api.fetchRepository(root),
    onSuccess: () => invalidateAfterFetch(queryClient, root)
  })
  const inFlight = useIsMutating({ mutationKey })

  return {
    start: () => {
      if (inFlight === 0) fetch.mutate()
    },
    busy: inFlight > 0,
    error: fetch.error
  }
}

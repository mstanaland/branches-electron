import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from './keys'

/** The Refresh operation's state for one repository. */
export interface RepositoryRefresh {
  /** Starts a refresh. Does nothing while one is already in flight. */
  start: () => void
  /** True while a refresh of this repository is running, including one started before this mount. */
  busy: boolean
}

/**
 * The **refresh**: re-reads everything on screen for one repository from disk — the same
 * re-read the window does when it regains focus — on demand.
 *
 * It never reaches the network. Fetch is the only control that talks to the remote, so a
 * refresh is always as fast as the local repository, and works offline.
 *
 * Invalidating marks every query for the repository stale and refetches the ones on screen,
 * which keeps their data in place until the new read lands: nothing the user is reading
 * blanks out. The saved list is re-read too, so a folder that vanished is noticed now rather
 * than on the next focus.
 *
 * `busy` comes from the query client rather than this mutation, so a refresh stays visibly in
 * flight across a tab switch that unmounts the control and back.
 */
export function useRefreshRepository(root: string): RepositoryRefresh {
  const queryClient = useQueryClient()
  const mutationKey = keys.refresh(root)

  const refresh = useMutation<void, Error, void>({
    mutationKey,
    mutationFn: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.repository(root) }),
        queryClient.invalidateQueries({ queryKey: keys.repositories() })
      ])
    }
  })
  const inFlight = useIsMutating({ mutationKey })

  return {
    start: () => {
      if (inFlight === 0) refresh.mutate()
    },
    busy: inFlight > 0
  }
}

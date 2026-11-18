import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import { api } from '../api'
import { invalidateAfterFetch } from './fetch'
import { keys } from './keys'

/** The Push operation's state for one repository. */
export interface RepositoryPush {
  /** Starts a push. Does nothing while one is already in flight. */
  start: () => void
  /** True while a push of this repository is running, including one started before this mount. */
  busy: boolean
  /** What the last push started from this mount failed with, else null. */
  error: ApiError | null
  /** When the last push from this mount was started, or 0 if none has been. See `RepositoryFetch`. */
  submittedAt: number
}

/**
 * **Push**: sends the **active repository**'s **current branch** to its **upstream**, from
 * the **operations area**. Shaped like Fetch and Pull, `busy` included.
 *
 * A push moves only refs — the remote's branch and our remote-tracking copy of it — so it
 * re-reads what a fetch would: branches, status and the publish target. HEAD and the work
 * tree are untouched.
 */
export function usePushRepository(root: string): RepositoryPush {
  const queryClient = useQueryClient()
  const mutationKey = keys.push(root)

  const push = useMutation<void, ApiError, void>({
    mutationKey,
    mutationFn: () => api.pushRepository(root),
    onSuccess: () => invalidateAfterFetch(queryClient, root)
  })
  const inFlight = useIsMutating({ mutationKey })

  return {
    start: () => {
      if (inFlight === 0) push.mutate()
    },
    busy: inFlight > 0,
    error: push.error,
    submittedAt: push.submittedAt
  }
}

/** The Publish Branch operation's state for one repository. */
export interface PublishBranch {
  /** Publishes the current branch to `remote`. Resolves once it has, so the dialog can close. */
  publish: (remote: string) => Promise<void>
  busy: boolean
  /** What the last attempt failed with, for the dialog to show. */
  error: ApiError | null
}

/**
 * **Publish branch**, run from its dialog. The failure stays with the dialog rather than the
 * operations row, so the user can read it, then retry or cancel without losing their place.
 */
export function usePublishBranch(root: string): PublishBranch {
  const queryClient = useQueryClient()

  const publish = useMutation<void, ApiError, string>({
    mutationKey: keys.publish(root),
    mutationFn: (remote) => api.publishBranch(root, remote),
    onSuccess: () => invalidateAfterFetch(queryClient, root)
  })

  return {
    publish: (remote) => publish.mutateAsync(remote),
    busy: publish.isPending,
    error: publish.error
  }
}

import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { keys } from './keys'

/** The saved repositories. Refetches on window focus, which recomputes each `missing` flag. */
export function useRepositories() {
  return useQuery({ queryKey: keys.repositories(), queryFn: () => api.listRepositories() })
}

/** Status of the active repository. Idle while `root` is null. A refetch keeps the old data on screen; a different repository starts empty. */
export function useStatus(root: string | null) {
  return useQuery({
    queryKey: keys.status(root ?? ''),
    queryFn: () => api.getStatus(root as string),
    enabled: root !== null
  })
}

/** Branches of the active repository. Idle while `root` is null. A refetch keeps the old data on screen; a different repository starts empty. */
export function useBranches(root: string | null) {
  return useQuery({
    queryKey: keys.branches(root ?? ''),
    queryFn: () => api.listBranches(root as string),
    enabled: root !== null
  })
}

/**
 * The staged and unstaged diffs of one change in the active repository. Idle while there is no
 * repository or no path. `originalPath` is the path a renamed file came from, else null.
 */
export function useDiff(root: string | null, path: string | null, originalPath: string | null) {
  return useQuery({
    queryKey: keys.diff(root ?? '', path ?? '', originalPath),
    queryFn: () => api.getDiff(root as string, path as string, originalPath),
    enabled: root !== null && path !== null
  })
}

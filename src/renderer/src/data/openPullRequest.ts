import { useMutation } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import { api } from '../api'

/**
 * Opens a **merged branch**'s **pull request** in the default browser. Main only opens a URL it
 * was given by GitHub for `root`, so pass the one `useMergedBranches` read.
 */
export function useOpenPullRequest(root: string) {
  return useMutation<void, ApiError, string>({
    mutationFn: (url) => api.openExternal(root, url)
  })
}

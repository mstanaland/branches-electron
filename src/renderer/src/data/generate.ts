import { useIsMutating, useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import type { ApiError } from '../../../shared/apiError'
import type { CommitMessage } from '../../../shared/git'
import { api } from '../api'
import { setDraftMessage } from './drafts'
import { keys } from './keys'
import { useSelection } from './tabs'

export interface GenerateState {
  /**
   * Starts **Generate** with `draft` as guidance. The answer replaces the draft whether or not
   * the form is still mounted; `onDone` runs only if it is.
   */
  generate: (draft: CommitMessage, onDone: () => void) => void
  /** Stops the run. It then fails as cancelled, which needs no telling. */
  stop: () => void
  /** Whether a run is going for this repository, including one started before a remount. */
  isPending: boolean
}

function stopRun(root: string): void {
  api.cancelGenerate(root).catch(() => {
    // The run is over either way; there is nothing to tell the user.
  })
}

/**
 * **Generate** for `root`'s commit form. Changes nothing in git, so nothing is invalidated.
 *
 * The run outlives the form: switching to History and back unmounts it, and the answer still
 * lands in the draft. What stops a run is its tab leaving the front (`useStopGenerateBehindTabs`).
 *
 * Failures are not kept for the form to show: main has already told the user in a warning
 * sheet, and the form's layout stays as it was.
 */
export function useGenerateCommitMessage(root: string): GenerateState {
  const { mutate } = useMutation<CommitMessage, ApiError, CommitMessage>({
    mutationKey: keys.generate(root),
    mutationFn: (draft) => api.generateCommitMessage(root, draft),
    // Here rather than in `mutate`'s callbacks, which are dropped once the form unmounts.
    onSuccess: (message) => setDraftMessage(root, message)
  })
  const isPending = useIsMutating({ mutationKey: keys.generate(root) }) > 0

  const generate = useCallback(
    (draft: CommitMessage, onDone: () => void) => mutate(draft, { onSuccess: onDone }),
    [mutate]
  )
  const stop = useCallback(() => stopRun(root), [root])

  return { generate, stop, isPending }
}

/**
 * Stops a repository's **Generate** run once its tab is no longer in front — another tab
 * focused, or the tab closed — so no answer lands in a draft nobody is looking at. Mounted
 * once, near the top of the app.
 */
export function useStopGenerateBehindTabs(): void {
  const { activeRoot } = useSelection()
  const previous = useRef(activeRoot)

  useEffect(() => {
    const left = previous.current
    previous.current = activeRoot
    if (left !== null && left !== activeRoot) stopRun(left)
  }, [activeRoot])
}

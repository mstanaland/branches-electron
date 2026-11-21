import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import type { CommitMessage } from '../../../shared/git'
import { api } from '../api'
import { keys } from './keys'

export type { CommitMessage }

/**
 * The message git is given: the subject, then a blank line, then the description.
 * Trimmed, so a trailing newline the user left behind doesn't become part of the message,
 * and a description of only whitespace doesn't leave an empty paragraph after the subject.
 */
export function buildCommitMessage({ subject, description }: CommitMessage): string {
  const body = description.trim()
  return body === '' ? `${subject.trim()}\n` : `${subject.trim()}\n\n${body}\n`
}

/**
 * Commits what is staged in `root`, then refreshes its status, branches and diffs: the
 * commit empties the index, moves the branch on and changes what ahead/behind says.
 *
 * Failures (an empty index, a hook that said no, signing) stay on the mutation for the form
 * to show; nothing is cleared here, so the user's message is never lost to a failed commit.
 */
export function useCommit(root: string) {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, CommitMessage>({
    mutationFn: (message) => api.commit(root, buildCommitMessage(message)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.status(root) }),
        queryClient.invalidateQueries({ queryKey: keys.branches(root) }),
        queryClient.invalidateQueries({ queryKey: keys.diffs(root) }),
        // The new commit belongs at the top of the history of whichever branch it landed on.
        // Every ref under this root is invalidated rather than working out which one that
        // was: the ones not on screen refetch lazily, and the branch's history is a prefix
        // key away.
        queryClient.invalidateQueries({ queryKey: keys.commitsOfAny(root) })
      ])
    }
  })
}

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../../../shared/apiError'
import { api } from '../api'
import { keys } from './keys'

/** The subject and description of one commit, as the form holds them. */
export interface CommitMessage {
  subject: string
  description: string
}

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
        queryClient.invalidateQueries({ queryKey: keys.diffs(root) })
      ])
    }
  })
}

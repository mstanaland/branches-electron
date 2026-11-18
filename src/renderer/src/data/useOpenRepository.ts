import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../api'
import { keys } from './keys'
import { useTabs } from './tabs'

/**
 * The open-a-repository command, from both of its triggers: the **Open Repository …** button
 * and File > Open Repository… (Cmd+O) in main's menu. Shows the folder picker, then puts the
 * chosen repository in a tab and refreshes the saved list. Cancelling the picker changes
 * nothing. Where the repository lands is the tab model's decision: a focused Repositories tab
 * becomes it, an already-open one is focused instead, a new tab otherwise (ADR 0007).
 *
 * Mounted once, near the top of the app, because the menu command has to reach it whatever
 * the focused tab is showing — a second instance would mean a second picker per keystroke.
 * The result is handed down to whoever draws the button and the error.
 */
export function useOpenRepository() {
  const queryClient = useQueryClient()
  const { chooseRepository } = useTabs()

  const open = useMutation({
    mutationFn: () => api.openRepository(),
    onSuccess: async (root) => {
      if (root === null) return
      chooseRepository(root)
      await queryClient.invalidateQueries({ queryKey: keys.repositories() })
    }
  })

  const { mutate } = open
  useEffect(() => api.onOpenRepositoryRequested(() => mutate()), [mutate])

  return open
}

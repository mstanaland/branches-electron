import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../api'
import { keys } from './keys'
import { useSelection } from './selection'

/**
 * Connects the renderer to main's periodic `git fetch`: tells it which repository is active,
 * and re-reads what a fetch can change when one moves a ref.
 *
 * Nothing on disk changes when a branch is merged upstream, so without this the ahead/behind
 * counts stay as stale as the user's last manual fetch. Mounted once, near the top of the app.
 */
export function useBackgroundFetch(): void {
  const { activeRoot } = useSelection()
  const client = useQueryClient()

  useEffect(() => {
    // Telling main is a background nicety; failing to must not break the UI.
    void api.setActiveRepository(activeRoot).catch((error: unknown) => {
      console.error('Could not set the active repository for background fetching:', error)
    })
  }, [activeRoot])

  useEffect(() => {
    return api.onRemoteRefsChanged((root) => {
      // Only upstream positions moved: branches, and the current branch's counts in status.
      // Diffs come from the work tree and the index, which a fetch never touches.
      void client.invalidateQueries({ queryKey: keys.branches(root) })
      void client.invalidateQueries({ queryKey: keys.status(root) })
    })
  }, [client])
}

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../api'
import { invalidateAfterFetch } from './fetch'
import { useSelection } from './tabs'

/**
 * Connects the renderer to main's periodic `git fetch`: tells it which repository is active —
 * the focused tab's, so three idle tabs make no network calls — and re-reads what a fetch can
 * change when one moves a ref.
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
      void invalidateAfterFetch(client, root)
    })
  }, [client])
}

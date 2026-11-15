import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { keys } from './keys'
import { useSelection } from './selection'

/**
 * Shows the folder picker, then makes the chosen repository active and refreshes the saved list.
 * Cancelling the picker changes nothing.
 */
export function useOpenRepository() {
  const queryClient = useQueryClient()
  const { setActiveRoot } = useSelection()

  return useMutation({
    mutationFn: () => api.openRepository(),
    onSuccess: async (root) => {
      if (root === null) return
      setActiveRoot(root)
      await queryClient.invalidateQueries({ queryKey: keys.repositories() })
    }
  })
}

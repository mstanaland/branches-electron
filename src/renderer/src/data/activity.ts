import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { keys } from './keys'

/**
 * True while anything for one repository is in flight: a read of its status, branches,
 * history or diffs — first load, refresh or a refetch on focus — or an operation keyed to it,
 * such as Fetch, Pull or Refresh.
 */
export function useRepositoryBusy(root: string): boolean {
  const reading = useIsFetching({ queryKey: keys.repository(root) })
  const operating = useIsMutating({ mutationKey: keys.repository(root) })
  return reading + operating > 0
}

/**
 * `active`, but only once it has stayed true for `delayMs`. Goes false the moment `active`
 * does. For progress that most of the time finishes too fast to be worth showing: an
 * indicator that flashes on and off reads as a glitch, not as progress.
 */
export function useDelayed(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setShown(true), delayMs)
    // Hidden again as soon as the activity ends, so the next one waits out the delay afresh.
    return () => {
      clearTimeout(timer)
      setShown(false)
    }
  }, [active, delayMs])

  return active && shown
}

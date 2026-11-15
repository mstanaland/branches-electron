import { focusManager } from '@tanstack/react-query'

/**
 * Teaches TanStack Query what "window focus" means in Electron.
 *
 * Its default listener watches `visibilitychange` alone, and an Electron window stays visible
 * when you switch to another app, so `refetchOnWindowFocus` never fired on a Mac: the app only
 * re-read git state when a mutation invalidated a query. Switching apps does deliver DOM
 * `focus`/`blur` to the window, so listen for those as well and keep `visibilitychange` for
 * minimising and hiding.
 *
 * Returns a teardown function for tests; the app installs this once and leaves it.
 */
export function installWindowFocusListener(): () => void {
  focusManager.setEventListener((handleFocus) => {
    const onFocus = (): void => handleFocus(true)
    const onBlur = (): void => handleFocus(false)
    const onVisibilityChange = (): void => handleFocus(document.visibilityState === 'visible')

    window.addEventListener('focus', onFocus, false)
    window.addEventListener('blur', onBlur, false)
    window.addEventListener('visibilitychange', onVisibilityChange, false)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('visibilitychange', onVisibilityChange)
    }
  })

  return () => {
    focusManager.setFocused(undefined)
    focusManager.setEventListener(() => undefined)
  }
}

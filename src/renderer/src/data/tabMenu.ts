import { useEffect } from 'react'
import { api } from '../api'
import { useTabs } from './tabs'

/**
 * The Window menu's half of the tab strip: it carries out the tab commands main sends, and
 * keeps main told how many tabs there are so the menu can grey out what the strip cannot do
 * (and so Cmd+W knows whether there is a tab to close or only the window).
 *
 * The shortcuts are menu items in main rather than key handlers here (ADR 0008): they then
 * show up in the menu with their accelerators, and keep working while focus is in a text
 * field, where a renderer-level Cmd+W would be fighting the text cursor.
 *
 * Mounted once, near the top of the app — a second instance would mean two tabs per Cmd+T.
 */
export function useTabMenu(): void {
  const { tabs, openTab, closeFocused, focusIndex, focusStep } = useTabs()

  useEffect(
    () =>
      api.onTabCommand((command) => {
        switch (command.type) {
          case 'new':
            return openTab()
          case 'close':
            return closeFocused()
          case 'previous':
            return focusStep(-1)
          case 'next':
            return focusStep(1)
          case 'focus':
            return focusIndex(command.index)
        }
      }),
    [openTab, closeFocused, focusIndex, focusStep]
  )

  const count = tabs.length
  useEffect(() => {
    // A failure here only leaves the menu a step behind, so it is logged rather than surfaced.
    api.setTabCount(count).catch((error: unknown) => console.error('Could not sync tabs:', error))
  }, [count])
}

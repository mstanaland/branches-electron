/**
 * The tab strip's shape, shared because both processes need it: the renderer owns the strip,
 * and the main process needs the limit and the command vocabulary to build the Window menu.
 */

/**
 * How many tabs the strip holds, of any kind (ADR 0007). The `+` button is absent once it is
 * full, and so are **New Tab** and **Open Repository …** in the menu, so the limit is visible
 * rather than discovered by a click that does nothing.
 */
export const MAX_TABS = 4

/**
 * What a Window-menu item asks the renderer to do with the strip. The menu lives in main
 * (ADR 0003) but the strip lives in the renderer, so the items send one of these rather than
 * changing anything themselves.
 */
export type TabCommand =
  | { readonly type: 'new' }
  | { readonly type: 'close' }
  | { readonly type: 'previous' }
  | { readonly type: 'next' }
  /** Focus the `index`th tab, counting from zero. Does nothing when there is no such tab. */
  | { readonly type: 'focus'; readonly index: number }

/** True for a tab count that could really have come from a strip. Anything off IPC is checked. */
export function isTabCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TABS
}

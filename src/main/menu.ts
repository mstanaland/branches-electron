import type { MenuItemConstructorOptions } from 'electron'
import type { BranchMenuAction } from '../shared/git'
import { MAX_TABS, type TabCommand } from '../shared/tabs'

/** What the branch context menu needs to know about the branch it is for. */
export interface BranchMenuTarget {
  name: string
  isCurrent: boolean
  /** False for the current branch, the default branch and one checked out in a work tree. */
  deletable: boolean
}

/**
 * A branch's context menu. Each item only reports the choice through `choose`; the renderer
 * acts on it, so it can show progress, errors and dialogs.
 */
export function createBranchMenuTemplate(
  branch: BranchMenuTarget,
  choose: (action: BranchMenuAction) => void
): MenuItemConstructorOptions[] {
  return [
    { label: 'Check out', enabled: !branch.isCurrent, click: () => choose('checkout') },
    { label: `Create New Branch from “${branch.name}”…`, click: () => choose('create') },
    { type: 'separator' },
    {
      // Disabled without explanation for a branch that can't go (see GLOSSARY: Delete branch).
      label: `Delete “${branch.name}”…`,
      enabled: branch.deletable,
      click: () => choose('delete')
    }
  ]
}

export interface MenuOptions {
  appName: string
  /**
   * How many tabs the strip holds right now, or null before the renderer has said. It drives
   * what is enabled, so the menu refuses what the strip cannot do instead of offering a
   * keystroke that does nothing — and it decides whether Cmd+W closes a tab or the window.
   */
  tabCount: number | null
  /** Called when the user chooses File > Open Repository… (Cmd+O). */
  openRepository: () => void
  /** Called with what a Window-menu item asks of the strip, which the renderer owns. */
  tabCommand: (command: TabCommand) => void
}

/** Ordinals for the Cmd+1 … Cmd+4 items, one per slot in the strip. */
const ORDINALS = ['First', 'Second', 'Third', 'Fourth'] as const

/**
 * The tab items of the Window menu. Every tab shortcut is a real menu item rather than a key
 * handler in the renderer: the menu shows the shortcuts, greys out what is unavailable, and
 * keeps working while focus is in a text field.
 *
 * Cmd+W never closes the window by surprise. While a tab is open it is **Close Tab**, so the
 * last close leaves the backdrop; only then does the same keystroke become **Close Window**.
 * That is also why window closing lives here rather than as `role: 'close'` in File — two
 * items cannot share one accelerator.
 *
 * A count of null is that same promise during the gap the round trip opens: the first menu is
 * built before the renderer has restored last launch's tabs, so until it reports, Cmd+W is a
 * disabled **Close Tab** rather than a **Close Window** that would take the window with it.
 * Everything counted off the strip's length is disabled then too; opening is not, because the
 * strip refuses an open of its own accord when it turns out to be full.
 */
function tabItems(options: MenuOptions): MenuItemConstructorOptions[] {
  const { tabCount, tabCommand } = options
  const send = (command: TabCommand) => () => tabCommand(command)
  // What is known about the strip's length, read as empty where nothing is known yet.
  const count = tabCount ?? 0
  return [
    {
      label: 'New Tab',
      accelerator: 'CmdOrCtrl+T',
      enabled: count < MAX_TABS,
      click: send({ type: 'new' })
    },
    tabCount === null || tabCount > 0
      ? {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          enabled: tabCount !== null,
          click: send({ type: 'close' })
        }
      : { label: 'Close Window', accelerator: 'CmdOrCtrl+W', role: 'close' },
    { type: 'separator' },
    {
      label: 'Show Previous Tab',
      accelerator: 'CmdOrCtrl+Shift+[',
      enabled: count > 1,
      click: send({ type: 'previous' })
    },
    {
      label: 'Show Next Tab',
      accelerator: 'CmdOrCtrl+Shift+]',
      enabled: count > 1,
      click: send({ type: 'next' })
    },
    { type: 'separator' },
    ...ORDINALS.map((ordinal, index) => ({
      label: `Show ${ordinal} Tab`,
      accelerator: `CmdOrCtrl+${index + 1}`,
      enabled: index < count,
      click: send({ type: 'focus', index })
    }))
  ]
}

/** The macOS application menu. Kept as plain data so it can be tested without Electron. */
export function createMenuTemplate(options: MenuOptions): MenuItemConstructorOptions[] {
  return [
    {
      label: options.appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Repository…',
          accelerator: 'CmdOrCtrl+O',
          // At the limit the chosen folder would have nowhere to go (ADR 0007), so the picker
          // never opens rather than opening and discarding the answer.
          enabled: (options.tabCount ?? 0) < MAX_TABS,
          click: () => options.openRepository()
        }
      ]
    },
    {
      // Without these roles, Cmd+C/V and friends stop working in text fields.
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
    {
      // Spelled out rather than `role: 'windowMenu'`, which would bring its own Cmd+W.
      label: 'Window',
      submenu: [
        ...tabItems(options),
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]
}

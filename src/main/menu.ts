import type { MenuItemConstructorOptions } from 'electron'

export interface MenuOptions {
  appName: string
  /** Called when the user chooses File > Open Repository… (Cmd+O). */
  openRepository: () => void
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
          click: () => options.openRepository()
        },
        { type: 'separator' },
        { role: 'close' }
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
    { role: 'windowMenu' }
  ]
}

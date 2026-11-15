import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { settle } from './apiResult'
import { createHandlers } from './handlers'
import { createRepositoryStore } from './repositoryStore'

/** Registers the handlers behind `window.api`. Logic lives in handlers.ts. */
export function registerIpc(): void {
  const store = createRepositoryStore({
    filePath: join(app.getPath('userData'), 'repositories.json')
  })
  const handlers = createHandlers({
    store,
    pickFolder: async () => {
      const options = { properties: ['openDirectory' as const] }
      const window = BrowserWindow.getFocusedWindow()
      const { canceled, filePaths } = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return canceled || filePaths.length === 0 ? null : filePaths[0]
    },
    showRepositoryMenu: () =>
      new Promise((resolve) => {
        const menu = Menu.buildFromTemplate([
          { label: 'Remove from List', click: () => resolve(true) }
        ])
        menu.popup({
          window: BrowserWindow.getFocusedWindow() ?? undefined,
          // `click` and this callback can arrive in either order; the first resolve wins, so
          // let a click land first before treating the close as a dismissal.
          callback: () => setImmediate(() => resolve(false))
        })
      }),
    showBranchMenu: (branch) =>
      new Promise((resolve) => {
        const menu = Menu.buildFromTemplate([
          { label: 'Check out', enabled: !branch.isCurrent, click: () => resolve('checkout') }
        ])
        menu.popup({
          window: BrowserWindow.getFocusedWindow() ?? undefined,
          // Same as the repository menu: let a click land before treating the close as a dismissal.
          callback: () => setImmediate(() => resolve(null))
        })
      }),
    confirmRemoval: async (repository) => {
      const options = {
        type: 'question' as const,
        message: `“${repository.name}” can’t be found.`,
        detail: 'Remove it from the list? The folder on disk is not touched.',
        buttons: ['Remove', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      }
      const window = BrowserWindow.getFocusedWindow()
      const { response } = window
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options)
      return response === 0
    }
  })

  ipcMain.handle('repository:open', () => settle(() => handlers.openRepository()))
  ipcMain.handle('repository:list', () => settle(() => handlers.listRepositories()))
  ipcMain.handle('repository:remove', (_event, root: string) =>
    settle(() => handlers.removeRepository(root))
  )
  ipcMain.handle('repository:menu', (_event, root: string) =>
    settle(() => handlers.showRepositoryMenu(root))
  )
  ipcMain.handle('repository:confirm-remove-missing', (_event, root: string) =>
    settle(() => handlers.confirmRemoveMissingRepository(root))
  )
  ipcMain.handle('repository:status', (_event, root: string) =>
    settle(() => handlers.getStatus(root))
  )
  ipcMain.handle('repository:branches', (_event, root: string) =>
    settle(() => handlers.listBranches(root))
  )
  ipcMain.handle(
    'repository:diff',
    (_event, root: string, path: string, originalPath: string | null) =>
      settle(() => handlers.getDiff(root, path, originalPath))
  )
  ipcMain.handle('repository:stage', (_event, root: string, paths: readonly string[]) =>
    settle(() => handlers.stageFiles(root, paths))
  )
  ipcMain.handle('repository:unstage', (_event, root: string, paths: readonly string[]) =>
    settle(() => handlers.unstageFiles(root, paths))
  )
  ipcMain.handle('branch:checkout', (_event, root: string, name: string) =>
    settle(() => handlers.checkoutBranch(root, name))
  )
  ipcMain.handle('branch:menu', (_event, root: string, name: string) =>
    settle(() => handlers.showBranchMenu(root, name))
  )
}

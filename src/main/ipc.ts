import { app, BrowserWindow, dialog, ipcMain } from 'electron'
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
    }
  })

  ipcMain.handle('repository:open', () => settle(() => handlers.openRepository()))
  ipcMain.handle('repository:list', () => settle(() => handlers.listRepositories()))
  ipcMain.handle('repository:remove', (_event, root: string) =>
    settle(() => handlers.removeRepository(root))
  )
  ipcMain.handle('repository:status', (_event, root: string) =>
    settle(() => handlers.getStatus(root))
  )
  ipcMain.handle('repository:branches', (_event, root: string) =>
    settle(() => handlers.listBranches(root))
  )
}

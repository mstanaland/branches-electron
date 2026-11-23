import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import type { CommitMessage } from '../shared/git'
import { settle } from './apiResult'
import { createFetchScheduler } from './fetchScheduler'
import { createCommitMessageGenerator, getClaudeExecutable } from './claude'
import { fetchRemote, hasRemote, readCommitContext } from './git'
import { findMergedBranchesOrNull, lookUpMergedPullRequests } from './github'
import { createHandlers } from './handlers'
import { createMergedBranchCache } from './mergedBranchCache'
import { createBranchMenuTemplate } from './menu'
import { createRepositoryStore } from './repositoryStore'
import { createWindowTitle } from './windowTitle'

/** Sends an event to every open window. Single-window today, but nothing here assumes that. */
function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args)
}

export interface IpcDeps {
  /**
   * Called with how many tabs the renderer's strip holds, so the application menu can be
   * rebuilt: what it enables, and whether Cmd+W closes a tab or the window, depend on it.
   */
  setTabCount: (count: number) => void
}

/** Registers the handlers behind `window.api`. Logic lives in handlers.ts. */
export function registerIpc(deps: IpcDeps): void {
  const store = createRepositoryStore({
    filePath: join(app.getPath('userData'), 'repositories.json')
  })

  // The window title follows the active repository, so Mission Control, the Window menu and
  // screen sharing name what is on screen. Single-window today, like `broadcast`.
  const windowTitle = createWindowTitle({
    appName: app.name,
    list: () => store.list(),
    setTitle: (title) => {
      for (const window of BrowserWindow.getAllWindows()) window.setTitle(title)
    }
  })

  // The last merged-branch result per repository. A first read, a fetch, a Refresh, regaining
  // focus or a delete asks GitHub again.
  const mergedBranches = createMergedBranchCache({
    find: (root) => findMergedBranchesOrNull(root, lookUpMergedPullRequests),
    onChanged: (root) => broadcast('repository:merged-branches-changed', root)
  })

  // Keeps the active repository's remote-tracking refs current so ahead/behind counts notice
  // work merged elsewhere, where there is no local change for anything to watch.
  const fetchScheduler = createFetchScheduler({
    hasRemote,
    fetch: fetchRemote,
    onRefsChanged: (root) => broadcast('repository:remote-refs-changed', root),
    onFetched: (root) => void mergedBranches.recompute(root)
  })
  // No network traffic from a backgrounded app.
  fetchScheduler.setFocused(BrowserWindow.getFocusedWindow() !== null)
  // The repository the user is looking at, so regaining focus can check its merged branches.
  let activeRoot: string | null = null
  app.on('browser-window-focus', () => {
    fetchScheduler.setFocused(true)
    // A pull request merged while the user was away shows up now, not at the next fetch.
    if (activeRoot !== null) void mergedBranches.recompute(activeRoot)
  })
  app.on('browser-window-blur', () =>
    fetchScheduler.setFocused(BrowserWindow.getFocusedWindow() !== null)
  )
  app.on('will-quit', () => fetchScheduler.stop())
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
        const menu = Menu.buildFromTemplate(createBranchMenuTemplate(branch, resolve))
        menu.popup({
          window: BrowserWindow.getFocusedWindow() ?? undefined,
          // Same as the repository menu: let a click land before treating the close as a dismissal.
          callback: () => setImmediate(() => resolve(null))
        })
      }),
    setActiveRepository: (root) => {
      activeRoot = root
      fetchScheduler.setActiveRepository(root)
      void windowTitle.follow(root)
    },
    setTabCount: (count) => deps.setTabCount(count),
    generator: createCommitMessageGenerator({
      locate: getClaudeExecutable,
      readContext: (root) => readCommitContext(root)
    }),
    mergedBranches,
    openExternal: (url) => shell.openExternal(url),
    showGenerateError: async (message) => {
      const options = {
        type: 'warning' as const,
        message: 'Generate couldn’t write a commit message.',
        detail: message,
        buttons: ['OK']
      }
      const window = BrowserWindow.getFocusedWindow()
      await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options))
    },
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
  ipcMain.handle('repository:merged-branches', (_event, root: string) =>
    settle(() => handlers.listMergedBranches(root))
  )
  ipcMain.handle('repository:recheck-merged-branches', (_event, root: string) =>
    settle(() => handlers.recheckMergedBranches(root))
  )
  ipcMain.handle('repository:open-external', (_event, root: string, url: string) =>
    settle(() => handlers.openExternal(root, url))
  )
  ipcMain.handle(
    'repository:commits',
    (_event, root: string, ref: string, limit: number, skip: number) =>
      settle(() => handlers.listCommits(root, ref, limit, skip))
  )
  ipcMain.handle('repository:unpushed-commits', (_event, root: string, ref: string) =>
    settle(() => handlers.listUnpushedCommits(root, ref))
  )
  ipcMain.handle('repository:commit-details', (_event, root: string, oid: string) =>
    settle(() => handlers.getCommitDetails(root, oid))
  )
  ipcMain.handle('repository:commit-files', (_event, root: string, oid: string) =>
    settle(() => handlers.listCommitFiles(root, oid))
  )
  ipcMain.handle(
    'repository:commit-file-diff',
    (_event, root: string, oid: string, path: string, originalPath: string | null) =>
      settle(() => handlers.getCommitFileDiff(root, oid, path, originalPath))
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
  ipcMain.handle('repository:commit', (_event, root: string, message: string) =>
    settle(() => handlers.commit(root, message))
  )
  ipcMain.handle(
    'repository:generate-commit-message',
    (_event, root: string, draft: CommitMessage) =>
      settle(() => handlers.generateCommitMessage(root, draft))
  )
  ipcMain.handle('repository:cancel-generate', (_event, root: string) =>
    settle(() => handlers.cancelGenerate(root))
  )
  ipcMain.handle('repository:set-active', (_event, root: string | null) =>
    settle(() => handlers.setActiveRepository(root))
  )
  ipcMain.handle('repository:fetch', (_event, root: string) =>
    settle(() => handlers.fetchRepository(root))
  )
  ipcMain.handle('repository:pull', (_event, root: string) =>
    settle(() => handlers.pullRepository(root))
  )
  ipcMain.handle('repository:push', (_event, root: string) =>
    settle(() => handlers.pushRepository(root))
  )
  ipcMain.handle('repository:publish-branch', (_event, root: string, remote: string) =>
    settle(() => handlers.publishBranch(root, remote))
  )
  ipcMain.handle('repository:publish-target', (_event, root: string) =>
    settle(() => handlers.getPublishTarget(root))
  )
  ipcMain.handle('tabs:set-count', (_event, count: number) =>
    settle(() => handlers.setTabCount(count))
  )
  ipcMain.handle('branch:checkout', (_event, root: string, name: string) =>
    settle(() => handlers.checkoutBranch(root, name))
  )
  ipcMain.handle('branch:create', (_event, root: string, source: string, name: string) =>
    settle(() => handlers.createBranch(root, source, name))
  )
  ipcMain.handle('branch:menu', (_event, root: string, name: string) =>
    settle(() => handlers.showBranchMenu(root, name))
  )
  ipcMain.handle('branch:deletion', (_event, root: string, name: string) =>
    settle(() => handlers.getBranchDeletion(root, name))
  )
  ipcMain.handle(
    'branch:delete',
    (_event, root: string, name: string, oid: string, upstreamOid: string | null) =>
      settle(() => handlers.deleteBranch(root, name, oid, upstreamOid))
  )
}

import { contextBridge, ipcRenderer } from 'electron'
import type { WindowApi } from '../shared/api'

// Only this narrow, typed API is exposed to the renderer — not ipcRenderer itself.
// Results travel as plain data; the renderer turns failures into ApiErrors (see unwrapApi).
const api: WindowApi = {
  openRepository: () => ipcRenderer.invoke('repository:open'),
  listRepositories: () => ipcRenderer.invoke('repository:list'),
  removeRepository: (root) => ipcRenderer.invoke('repository:remove', root),
  showRepositoryMenu: (root) => ipcRenderer.invoke('repository:menu', root),
  confirmRemoveMissingRepository: (root) =>
    ipcRenderer.invoke('repository:confirm-remove-missing', root),
  onOpenRepositoryRequested: (listener) => {
    // Wrap it so the IPC event object never reaches the renderer.
    const forward = (): void => listener()
    ipcRenderer.on('menu:open-repository', forward)
    return () => {
      ipcRenderer.removeListener('menu:open-repository', forward)
    }
  },
  onRemoteRefsChanged: (listener) => {
    // Wrap it so the IPC event object never reaches the renderer.
    const forward = (_event: unknown, root: string): void => listener(root)
    ipcRenderer.on('repository:remote-refs-changed', forward)
    return () => {
      ipcRenderer.removeListener('repository:remote-refs-changed', forward)
    }
  },
  getStatus: (root) => ipcRenderer.invoke('repository:status', root),
  listBranches: (root) => ipcRenderer.invoke('repository:branches', root),
  getDiff: (root, path, originalPath) =>
    ipcRenderer.invoke('repository:diff', root, path, originalPath),
  stageFiles: (root, paths) => ipcRenderer.invoke('repository:stage', root, paths),
  unstageFiles: (root, paths) => ipcRenderer.invoke('repository:unstage', root, paths),
  commit: (root, message) => ipcRenderer.invoke('repository:commit', root, message),
  setActiveRepository: (root) => ipcRenderer.invoke('repository:set-active', root),
  checkoutBranch: (root, name) => ipcRenderer.invoke('branch:checkout', root, name),
  showBranchMenu: (root, name) => ipcRenderer.invoke('branch:menu', root, name)
}

contextBridge.exposeInMainWorld('api', api)

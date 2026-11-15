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
  getStatus: (root) => ipcRenderer.invoke('repository:status', root),
  listBranches: (root) => ipcRenderer.invoke('repository:branches', root),
  checkoutBranch: (root, name) => ipcRenderer.invoke('branch:checkout', root, name),
  showBranchMenu: (root, name) => ipcRenderer.invoke('branch:menu', root, name)
}

contextBridge.exposeInMainWorld('api', api)

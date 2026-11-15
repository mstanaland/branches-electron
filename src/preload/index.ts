import { contextBridge, ipcRenderer } from 'electron'
import type { BranchesApi } from '../shared/api'

// Only this narrow, typed API is exposed to the renderer — not ipcRenderer itself.
// Results travel as plain data; the renderer turns failures into ApiErrors (see unwrapApi).
const api: BranchesApi = {
  openRepository: () => ipcRenderer.invoke('repository:open'),
  getStatus: (root) => ipcRenderer.invoke('repository:status', root),
  listBranches: (root) => ipcRenderer.invoke('repository:branches', root)
}

contextBridge.exposeInMainWorld('api', api)

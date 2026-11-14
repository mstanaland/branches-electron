import { contextBridge, ipcRenderer } from 'electron'
import type { BranchesApi } from '../shared/api'

// Only this narrow, typed API is exposed to the renderer — not ipcRenderer itself.
const api: BranchesApi = {
  appVersion: () => ipcRenderer.invoke('app:version')
}

contextBridge.exposeInMainWorld('api', api)

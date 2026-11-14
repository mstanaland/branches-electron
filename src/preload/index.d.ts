import type { BranchesApi } from '../shared/api'

declare global {
  interface Window {
    api: BranchesApi
  }
}

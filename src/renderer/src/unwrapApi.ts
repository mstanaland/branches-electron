import type { BranchesApi } from '../../shared/api'
import type { ApiResult } from '../../shared/result'
import { unwrapResult } from './unwrapResult'

/** `BranchesApi` as the rest of the renderer sees it: values on success, `ApiError` on failure. */
export type UnwrappedApi = {
  [K in keyof BranchesApi]: BranchesApi[K] extends (
    ...args: infer Args
  ) => Promise<ApiResult<infer Value>>
    ? (...args: Args) => Promise<Value>
    : never
}

export function unwrapApi(api: BranchesApi): UnwrappedApi {
  const entries = Object.entries(api).map(([name, call]) => [
    name,
    async (...args: unknown[]) =>
      unwrapResult(await (call as (...a: unknown[]) => Promise<ApiResult<unknown>>)(...args))
  ])
  return Object.fromEntries(entries) as UnwrappedApi
}

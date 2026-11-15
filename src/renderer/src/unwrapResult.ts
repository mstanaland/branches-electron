import { ApiError } from '../../shared/apiError'
import type { ApiResult } from '../../shared/result'

export function unwrapResult<T>(result: ApiResult<T>): T {
  if (result.ok) return result.value
  throw new ApiError(result.error)
}

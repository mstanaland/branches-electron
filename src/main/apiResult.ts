import { ApiError, type ApiErrorData } from '../shared/apiError'
import type { ApiResult } from '../shared/result'
import { GitError } from './git'

export function toApiError(error: unknown): ApiErrorData {
  if (error instanceof ApiError || error instanceof GitError) {
    const data: ApiErrorData = { code: error.code, message: error.message }
    if (error.stderr) data.stderr = error.stderr
    if (error.files?.length) data.files = [...error.files]
    return data
  }
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}

/** Runs `fn` and turns a failure into a result the renderer can rethrow as an ApiError. */
export async function settle<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return { ok: false, error: toApiError(error) }
  }
}

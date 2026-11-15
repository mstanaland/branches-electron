import type { ApiErrorCode } from '../../../shared/apiError'
import { ApiError } from '../../../shared/apiError'

/** An error in a form the UI can display. */
export interface ErrorInfo {
  code: ApiErrorCode
  message: string
  /** The repository folder is gone or is no longer a repository: show "Repository not found". */
  notARepository: boolean
}

/** Turns whatever a query or mutation threw into something displayable. Null when there is no error. */
export function describeError(error: unknown): ErrorInfo | null {
  if (error === null || error === undefined) return null
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      notARepository: error.code === 'NOT_A_REPOSITORY'
    }
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : String(error),
    notARepository: false
  }
}

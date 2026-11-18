/** Codes the renderer can check on a failed `window.api` call. */
export type ApiErrorCode =
  | 'GIT_NOT_FOUND'
  | 'NOT_A_REPOSITORY'
  | 'COMMAND_FAILED'
  | 'CHECKOUT_BLOCKED_BY_CHANGES'
  | 'DETACHED_HEAD'
  | 'NO_UPSTREAM'
  | 'PULL_NOT_FAST_FORWARD'
  | 'REPOSITORY_NOT_OPEN'
  | 'NO_REMOTE'
  | 'INVALID_PATH'
  | 'INVALID_REF'
  | 'INVALID_TAB_COUNT'
  | 'UNKNOWN'

/** A failure from the main process, in a form that survives crossing IPC. */
export interface ApiErrorData {
  code: ApiErrorCode
  message: string
  stderr?: string
  /** For CHECKOUT_BLOCKED_BY_CHANGES: the files that stand in the way. */
  files?: string[]
}

/** What the renderer catches. Rebuilt there from the data main sent (see `unwrapApi`). */
export class ApiError extends Error implements ApiErrorData {
  readonly code: ApiErrorCode
  readonly stderr?: string
  readonly files?: string[]

  constructor(data: ApiErrorData) {
    super(data.message)
    this.name = 'ApiError'
    this.code = data.code
    this.stderr = data.stderr
    this.files = data.files
  }
}

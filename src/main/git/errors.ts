export type GitErrorCode =
  | 'GIT_NOT_FOUND'
  | 'NOT_A_REPOSITORY'
  | 'COMMAND_FAILED'
  | 'CHECKOUT_BLOCKED_BY_CHANGES'

/** Every failure from the git layer is a GitError, so callers can rely on its shape. */
export class GitError extends Error {
  readonly code: GitErrorCode
  readonly args: readonly string[]
  readonly exitCode: number | null
  readonly stderr: string
  /** What git wrote to stdout before failing. Hook output often lands here, not on stderr. */
  readonly stdout: string
  /** For CHECKOUT_BLOCKED_BY_CHANGES: the files that stand in the way. Empty otherwise. */
  readonly files: readonly string[]

  constructor(
    code: GitErrorCode,
    message: string,
    details: {
      args?: readonly string[]
      exitCode?: number | null
      stderr?: string
      stdout?: string
      files?: readonly string[]
    } = {}
  ) {
    super(message)
    this.name = 'GitError'
    this.code = code
    this.args = details.args ?? []
    this.exitCode = details.exitCode ?? null
    this.stderr = details.stderr ?? ''
    this.stdout = details.stdout ?? ''
    this.files = details.files ?? []
  }
}

export type GitErrorCode = 'GIT_NOT_FOUND' | 'NOT_A_REPOSITORY' | 'COMMAND_FAILED'

/** Every failure from the git layer is a GitError, so callers can rely on its shape. */
export class GitError extends Error {
  readonly code: GitErrorCode
  readonly args: readonly string[]
  readonly exitCode: number | null
  readonly stderr: string

  constructor(
    code: GitErrorCode,
    message: string,
    details: { args?: readonly string[]; exitCode?: number | null; stderr?: string } = {}
  ) {
    super(message)
    this.name = 'GitError'
    this.code = code
    this.args = details.args ?? []
    this.exitCode = details.exitCode ?? null
    this.stderr = details.stderr ?? ''
  }
}

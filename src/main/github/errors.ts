export type GitHubErrorCode = 'GH_NOT_FOUND' | 'GH_FAILED' | 'GH_BAD_RESPONSE'

/**
 * Every failure from asking GitHub is a GitHubError, so callers can rely on its shape. None of
 * them reach the user: merged-branch detection is silent when `gh` can't help (ADR-0011).
 */
export class GitHubError extends Error {
  readonly code: GitHubErrorCode
  readonly args: readonly string[]
  readonly exitCode: number | null
  /** What `gh` wrote to stderr, if anything. */
  readonly stderr: string

  constructor(
    code: GitHubErrorCode,
    message: string,
    details: { args?: readonly string[]; exitCode?: number | null; stderr?: string } = {}
  ) {
    super(message)
    this.name = 'GitHubError'
    this.code = code
    this.args = details.args ?? []
    this.exitCode = details.exitCode ?? null
    this.stderr = details.stderr ?? ''
  }
}

/** `gh` isn't where it was looked for, or vanished between being found and being run. */
export function ghNotFound(): GitHubError {
  return new GitHubError('GH_NOT_FOUND', 'The GitHub CLI (gh) isn’t installed.')
}

/** GitHub answered, but not with what was asked for. */
export function badResponse(reason: string): GitHubError {
  return new GitHubError('GH_BAD_RESPONSE', `GitHub’s answer was not usable: ${reason}`)
}

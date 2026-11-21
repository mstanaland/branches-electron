export type ClaudeErrorCode =
  | 'CLAUDE_NOT_FOUND'
  | 'CLAUDE_FAILED'
  | 'GENERATE_TIMED_OUT'
  | 'GENERATE_CANCELLED'

/**
 * Every failure from running Claude Code is a ClaudeError, so callers can rely on its shape.
 * Unlike GitError it keeps no `args`: they are always the same, and mostly the system prompt.
 */
export class ClaudeError extends Error {
  readonly code: ClaudeErrorCode
  readonly exitCode: number | null
  /** What Claude Code wrote to stderr, if anything. */
  readonly stderr: string

  constructor(
    code: ClaudeErrorCode,
    message: string,
    details: { exitCode?: number | null; stderr?: string } = {}
  ) {
    super(message)
    this.name = 'ClaudeError'
    this.code = code
    this.exitCode = details.exitCode ?? null
    this.stderr = details.stderr ?? ''
  }
}

/** `claude` isn't where it was looked for, or vanished between being found and being run. */
export function claudeNotFound(): ClaudeError {
  return new ClaudeError(
    'CLAUDE_NOT_FOUND',
    'Claude Code isn’t installed. Install it from claude.com/claude-code, then try again.'
  )
}

/** The user pressed Stop, or the run was replaced or its tab left the front. */
export function generateCancelled(): ClaudeError {
  return new ClaudeError('GENERATE_CANCELLED', 'Generate was stopped.')
}

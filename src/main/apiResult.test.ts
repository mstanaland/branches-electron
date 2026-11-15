import { describe, expect, it } from 'vitest'
import { ApiError } from '../shared/apiError'
import { GitError } from './git'
import { settle, toApiError } from './apiResult'

describe('toApiError', () => {
  it('converts a GitError, keeping code, message and stderr', () => {
    const error = new GitError('NOT_A_REPOSITORY', '/tmp/x is not inside a git repository.', {
      args: ['rev-parse'],
      exitCode: 128,
      stderr: 'fatal: not a git repository\n'
    })

    expect(toApiError(error)).toEqual({
      code: 'NOT_A_REPOSITORY',
      message: '/tmp/x is not inside a git repository.',
      stderr: 'fatal: not a git repository\n'
    })
  })

  it('leaves out stderr when there is none', () => {
    const data = toApiError(new GitError('GIT_NOT_FOUND', 'git was not found on this computer.'))

    expect(data).toEqual({ code: 'GIT_NOT_FOUND', message: 'git was not found on this computer.' })
  })

  it('passes an ApiError through', () => {
    const error = new ApiError({ code: 'INVALID_PATH', message: '../x points outside.' })

    expect(toApiError(error)).toEqual({ code: 'INVALID_PATH', message: '../x points outside.' })
  })

  it('reports anything else as UNKNOWN', () => {
    expect(toApiError(new Error('boom'))).toEqual({ code: 'UNKNOWN', message: 'boom' })
    expect(toApiError('a string')).toEqual({ code: 'UNKNOWN', message: 'a string' })
  })
})

describe('settle', () => {
  it('wraps a resolved value', async () => {
    await expect(settle(async () => 42)).resolves.toEqual({ ok: true, value: 42 })
  })

  it('wraps a failure instead of throwing', async () => {
    const result = await settle(async () => {
      throw new GitError('COMMAND_FAILED', 'git status failed', { stderr: 'bad' })
    })

    expect(result).toEqual({
      ok: false,
      error: { code: 'COMMAND_FAILED', message: 'git status failed', stderr: 'bad' }
    })
  })
})

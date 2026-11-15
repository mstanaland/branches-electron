import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/apiError'
import { unwrapResult } from './unwrapResult'

describe('unwrapResult', () => {
  it('returns the value of a successful result', () => {
    expect(unwrapResult({ ok: true, value: ['main'] })).toEqual(['main'])
  })

  it('throws an ApiError carrying the code, message and stderr', () => {
    const failed = {
      ok: false,
      error: {
        code: 'COMMAND_FAILED',
        message: 'git status failed: fatal: oops',
        stderr: 'fatal: oops\n'
      }
    } as const

    let thrown: unknown
    try {
      unwrapResult(failed)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({
      code: 'COMMAND_FAILED',
      message: 'git status failed: fatal: oops',
      stderr: 'fatal: oops\n'
    })
  })
})

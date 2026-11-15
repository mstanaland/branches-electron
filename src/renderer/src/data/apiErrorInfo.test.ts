import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import { describeError } from './apiErrorInfo'

describe('describeError', () => {
  it('returns the code and message of an ApiError', () => {
    const error = new ApiError({ code: 'COMMAND_FAILED', message: 'git failed' })
    expect(describeError(error)).toEqual({
      code: 'COMMAND_FAILED',
      message: 'git failed',
      notARepository: false
    })
  })

  it('flags NOT_A_REPOSITORY so the main pane can show "Repository not found"', () => {
    const error = new ApiError({ code: 'NOT_A_REPOSITORY', message: 'gone' })
    expect(describeError(error)?.notARepository).toBe(true)
  })

  it('describes any other Error as UNKNOWN', () => {
    expect(describeError(new Error('boom'))).toEqual({
      code: 'UNKNOWN',
      message: 'boom',
      notARepository: false
    })
  })

  it('describes a non-Error value as UNKNOWN', () => {
    expect(describeError('nope')).toEqual({
      code: 'UNKNOWN',
      message: 'nope',
      notARepository: false
    })
  })

  it('returns null when there is no error', () => {
    expect(describeError(null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import type { BranchesApi } from '../../shared/api'
import { ApiError } from '../../shared/apiError'
import { unwrapApi } from './unwrapApi'

/** A bridge whose every call resolves with the given result, as `window.api` does. */
function bridgeReturning(result: unknown): BranchesApi {
  const respond = async (): Promise<never> => result as never
  return {
    openRepository: respond,
    listRepositories: respond,
    removeRepository: respond,
    showRepositoryMenu: respond,
    confirmRemoveMissingRepository: respond,
    getStatus: respond,
    listBranches: respond
  }
}

describe('unwrapApi', () => {
  it('resolves with the value of a successful call', async () => {
    const api = unwrapApi(bridgeReturning({ ok: true, value: '/Users/me/repo' }))

    await expect(api.openRepository()).resolves.toBe('/Users/me/repo')
  })

  it('rejects with a real ApiError carrying code and stderr', async () => {
    const api = unwrapApi(
      bridgeReturning({
        ok: false,
        error: { code: 'NOT_A_REPOSITORY', message: 'nope', stderr: 'fatal' }
      })
    )

    const error = await api.getStatus('/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'NOT_A_REPOSITORY', message: 'nope', stderr: 'fatal' })
  })

  it('passes arguments through', async () => {
    const seen: unknown[][] = []
    const raw = bridgeReturning({ ok: true, value: [] })
    raw.listBranches = async (...args) => {
      seen.push(args)
      return { ok: true, value: [] }
    }

    await unwrapApi(raw).listBranches('/repo')

    expect(seen).toEqual([['/repo']])
  })
})

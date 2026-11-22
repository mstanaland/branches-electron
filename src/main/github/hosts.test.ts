import { describe, expect, it } from 'vitest'
import { parseLoggedInHosts } from './hosts'

describe('parseLoggedInHosts', () => {
  it('lists each host with an active account that is logged in', () => {
    const json = {
      hosts: {
        'github.com': [
          { host: 'github.com', active: false, state: 'success' },
          { host: 'github.com', active: true, state: 'success' }
        ],
        'github.example.com': [{ host: 'github.example.com', active: true, state: 'success' }]
      }
    }

    expect(parseLoggedInHosts(json)).toEqual(new Set(['github.com', 'github.example.com']))
  })

  it('leaves out a host whose active account has a bad token', () => {
    const json = {
      hosts: { 'github.com': [{ host: 'github.com', active: true, state: 'error' }] }
    }

    expect(parseLoggedInHosts(json)).toEqual(new Set())
  })

  it('compares hosts in lower case, as remotes are parsed', () => {
    const json = {
      hosts: { 'GitHub.com': [{ host: 'GitHub.com', active: true, state: 'success' }] }
    }

    expect(parseLoggedInHosts(json)).toEqual(new Set(['github.com']))
  })

  it.each([
    ['not an object', 'nope'],
    ['no hosts', {}],
    ['accounts that are not a list', { hosts: { 'github.com': 'yes' } }]
  ])('rejects %s', (_case, json) => {
    expect(() => parseLoggedInHosts(json)).toThrow(
      expect.objectContaining({ code: 'GH_BAD_RESPONSE' })
    )
  })
})

import { describe, expect, it } from 'vitest'
import { buildMergedPullRequestsQuery, parseMergedPullRequests } from './query'

const REPO = { host: 'github.com', owner: 'octo', name: 'hello' }

const pr = (number: number, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/octo/hello/pull/${number}`,
  mergedAt: '2026-11-01T10:00:00Z',
  baseRefName: 'main',
  headRefOid: 'a'.repeat(40),
  ...overrides
})

/** A response shaped like the one GitHub gives for `buildMergedPullRequestsQuery`. */
function response(heads: Array<Array<Record<string, unknown>>>, defaultBranch = 'main'): unknown {
  const repository: Record<string, unknown> = { defaultBranchRef: { name: defaultBranch } }
  heads.forEach((nodes, index) => {
    repository[`h${index}`] = { nodes }
  })
  return { data: { repository } }
}

describe('buildMergedPullRequestsQuery', () => {
  it('passes the repository and every head name as variables, never inside the query text', () => {
    const heads = ['feature/a', 'x") { evil }']

    const body = buildMergedPullRequestsQuery(REPO, heads)

    expect(body.variables).toEqual({
      owner: 'octo',
      name: 'hello',
      h0: 'feature/a',
      h1: 'x") { evil }'
    })
    expect(body.query).not.toContain('feature/a')
    expect(body.query).not.toContain('evil')
  })
})

describe('parseMergedPullRequests', () => {
  it('reads the default branch and each head name’s merged pull requests', () => {
    const answer = parseMergedPullRequests(response([[pr(1), pr(2)], []]), ['a', 'b'])

    expect(answer.defaultBranch).toBe('main')
    expect(answer.byHead.get('a')).toEqual([
      {
        number: 1,
        title: 'PR 1',
        url: 'https://github.com/octo/hello/pull/1',
        baseBranch: 'main',
        mergedAt: '2026-11-01T10:00:00Z',
        headOid: 'a'.repeat(40)
      },
      expect.objectContaining({ number: 2 })
    ])
    expect(answer.byHead.get('b')).toEqual([])
  })

  it('reads a repository with no default branch, as an empty one has', () => {
    const json = { data: { repository: { defaultBranchRef: null, h0: { nodes: [] } } } }

    expect(parseMergedPullRequests(json, ['a']).defaultBranch).toBeNull()
  })

  it.each([
    ['not an object', 'nope'],
    ['GraphQL errors', { errors: [{ message: 'Could not resolve to a Repository' }] }],
    ['no repository', { data: { repository: null } }],
    ['a missing alias', response([])],
    ['a pull request with no number', response([[pr(1, { number: 'one' })]])],
    ['a pull request with a non-https URL', response([[pr(1, { url: 'javascript:alert(1)' })]])],
    ['a pull request with a bad head oid', response([[pr(1, { headRefOid: 'zzz' })]])],
    ['a pull request with no merge time', response([[pr(1, { mergedAt: null })]])]
  ])('rejects %s', (_case, json) => {
    expect(() => parseMergedPullRequests(json, ['a'])).toThrow(
      expect.objectContaining({ code: 'GH_BAD_RESPONSE' })
    )
  })
})

import type { PullRequest } from '../../shared/github'
import { badResponse } from './errors'
import type { GitHubRepository } from './remote'

/** A merged pull request, with the head commit GitHub kept as the branch's original tip. */
export interface MergedPullRequest extends PullRequest {
  /** Full oid of the pull request's head commit when it was merged. */
  headOid: string
}

/** GitHub's answer for one repository. */
export interface MergedPullRequests {
  /** The repository's **default branch** on GitHub, or null when it has none (no commits). */
  defaultBranch: string | null
  /** Each asked-for head branch name's merged pull requests, in no particular order. */
  byHead: Map<string, MergedPullRequest[]>
}

/**
 * How many merged pull requests to read per head name. Updated most recently first, so only a
 * name reused this many times over could hide the newest.
 */
const PER_HEAD = 10

/** The body of a `gh api graphql --input -` call. */
export interface GraphQLBody {
  query: string
  variables: Record<string, string>
}

/**
 * One query for a whole repository: its default branch, and one aliased `pullRequests` field
 * per head name (`h0`, `h1`, …). Names travel as variables, so nothing a branch is called can
 * change the query.
 */
export function buildMergedPullRequestsQuery(
  repository: GitHubRepository,
  headNames: readonly string[]
): GraphQLBody {
  const variables: Record<string, string> = { owner: repository.owner, name: repository.name }
  const declarations = ['$owner: String!', '$name: String!']
  const fields: string[] = []
  headNames.forEach((headName, index) => {
    variables[`h${index}`] = headName
    declarations.push(`$h${index}: String!`)
    fields.push(
      `h${index}: pullRequests(headRefName: $h${index}, states: MERGED, first: ${PER_HEAD}, ` +
        `orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ...pr } }`
    )
  })
  const query = [
    `query MergedPullRequests(${declarations.join(', ')}) {`,
    '  repository(owner: $owner, name: $name) {',
    '    defaultBranchRef { name }',
    ...fields.map((field) => `    ${field}`),
    '  }',
    '}',
    'fragment pr on PullRequest { number title url mergedAt baseRefName headRefOid }'
  ].join('\n')
  return { query, variables }
}

/**
 * Reads GitHub's answer to `buildMergedPullRequestsQuery` for the same `headNames`. Anything
 * not shaped as asked — GraphQL errors, a repository GitHub can't see, a URL that isn't
 * https — is GH_BAD_RESPONSE: half an answer is never trusted.
 */
export function parseMergedPullRequests(
  json: unknown,
  headNames: readonly string[]
): MergedPullRequests {
  if (!isRecord(json)) throw badResponse('not a JSON object.')
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const first: unknown = json.errors[0]
    const message = isRecord(first) && typeof first.message === 'string' ? first.message : ''
    throw badResponse(message || 'GraphQL errors.')
  }
  const repository = isRecord(json.data) ? json.data.repository : undefined
  if (!isRecord(repository)) throw badResponse('no repository.')

  const defaultRef = repository.defaultBranchRef
  let defaultBranch: string | null = null
  if (isRecord(defaultRef) && typeof defaultRef.name === 'string') defaultBranch = defaultRef.name
  else if (defaultRef !== null) throw badResponse('no default branch field.')

  const byHead = new Map<string, MergedPullRequest[]>()
  headNames.forEach((headName, index) => {
    const connection = repository[`h${index}`]
    if (!isRecord(connection) || !Array.isArray(connection.nodes)) {
      throw badResponse(`no pull requests for ${headName}.`)
    }
    byHead.set(headName, connection.nodes.map(parsePullRequest))
  })
  return { defaultBranch, byHead }
}

function parsePullRequest(node: unknown): MergedPullRequest {
  if (
    !isRecord(node) ||
    !Number.isSafeInteger(node.number) ||
    typeof node.title !== 'string' ||
    typeof node.url !== 'string' ||
    typeof node.mergedAt !== 'string' ||
    typeof node.baseRefName !== 'string' ||
    typeof node.headRefOid !== 'string'
  ) {
    throw badResponse('a pull request is missing fields.')
  }
  // The renderer may open this URL, so only a real https link is kept.
  if (!isHttpsUrl(node.url)) throw badResponse('a pull request URL is not https.')
  if (!/^[0-9a-f]{40}$/.test(node.headRefOid)) throw badResponse('a head commit is not an oid.')
  if (Number.isNaN(Date.parse(node.mergedAt))) throw badResponse('a merge time is not a date.')
  return {
    number: node.number as number,
    title: node.title,
    url: node.url,
    baseBranch: node.baseRefName,
    mergedAt: node.mergedAt,
    headOid: node.headRefOid
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

import { execFile } from 'node:child_process'
import { GitHubError, ghNotFound } from './errors'
import { getGhExecutable } from './executable'
import { parseLoggedInHosts } from './hosts'
import { buildMergedPullRequestsQuery, parseMergedPullRequests } from './query'
import type { MergedPullRequests } from './query'
import type { GitHubRepository } from './remote'

/** Long enough for a slow network, short enough that a hung `gh` doesn't linger. */
const GH_TIMEOUT_MS = 20_000

/** A few hundred aliases of ten pull requests each is well under this. */
const MAX_OUTPUT = 16 * 1024 * 1024

/**
 * Asks GitHub, through the user's `gh`, for `repository`'s default branch and each head name's
 * merged pull requests: one `gh api graphql` call, on the remote's host — only when `gh` is
 * logged into that host.
 *
 * Rejects with a GitHubError: GH_NOT_FOUND, GH_FAILED (logged out, offline, a host `gh` doesn't
 * know) or GH_BAD_RESPONSE.
 */
export async function lookUpMergedPullRequests(
  repository: GitHubRepository,
  headNames: readonly string[]
): Promise<MergedPullRequests> {
  const gh = await getGhExecutable()
  // `gh api` sends a query to any host, logged in or not, so a GitLab remote would get its
  // branch names unless the host is checked first.
  const hosts = parseLoggedInHosts(await runGhJson(gh, ['auth', 'status', '--json', 'hosts']))
  if (!hosts.has(repository.host)) {
    throw new GitHubError('GH_FAILED', `gh isn’t logged in to ${repository.host}.`)
  }
  const body = buildMergedPullRequestsQuery(repository, headNames)
  // The query and every branch name go on stdin, so none of them is ever an argument.
  const args = ['api', 'graphql', '--hostname', repository.host, '--input', '-']
  return parseMergedPullRequests(await runGhJson(gh, args, JSON.stringify(body)), headNames)
}

/** Runs `gh` and parses what it printed as JSON. */
async function runGhJson(gh: string, args: readonly string[], input = ''): Promise<unknown> {
  const stdout = await runGh(gh, args, input)
  try {
    return JSON.parse(stdout)
  } catch {
    throw new GitHubError('GH_BAD_RESPONSE', `gh ${args[0] ?? ''} didn’t print JSON.`, { args })
  }
}

/** Runs `gh` without a shell, never waiting on a prompt nobody can see. */
function runGh(gh: string, args: readonly string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      gh,
      args,
      {
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT,
        timeout: GH_TIMEOUT_MS,
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: '1',
          GH_NO_UPDATE_NOTIFIER: '1',
          GH_SPINNER_DISABLED: '1',
          NO_COLOR: '1'
        }
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout)
          return
        }
        if (error.code === 'ENOENT') {
          reject(ghNotFound())
          return
        }
        const exitCode = typeof error.code === 'number' ? error.code : null
        reject(
          new GitHubError('GH_FAILED', `gh ${args.join(' ')} failed: ${stderr.trim()}`, {
            args,
            exitCode,
            stderr
          })
        )
      }
    )
    child.stdin?.on('error', () => {
      // `gh` exiting before reading everything surfaces through the exit, not here.
    })
    child.stdin?.end(input)
  })
}

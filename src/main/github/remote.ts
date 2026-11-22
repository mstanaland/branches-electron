/** A repository on GitHub, or on a GitHub Enterprise host, as `gh` addresses it. */
export interface GitHubRepository {
  /** Lower-cased, e.g. "github.com". `gh --hostname` takes it as is. */
  host: string
  owner: string
  name: string
}

/** What GitHub allows in an owner or repository name. No leading dash, so never an option. */
const NAME = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/

/**
 * The GitHub repository a **remote**'s URL points to, from the https, ssh and scp-like forms
 * (`git@host:owner/repo.git`). Null for anything that isn't `host/owner/repo`: a local path,
 * a file URL, or a host with deeper paths, like a GitLab subgroup.
 *
 * Any host passes. Whether `gh` can serve it is only known by asking, so a remote on GitLab
 * parses here and fails quietly there.
 */
export function parseGitHubRemote(url: string): GitHubRepository | null {
  const parts = splitUrl(url.trim())
  if (parts === null) return null
  const segments = parts.path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split('/')
  if (segments.length !== 2) return null
  const [owner, name] = segments
  if (!NAME.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null
  return { host: parts.host.toLowerCase(), owner, name }
}

function splitUrl(url: string): { host: string; path: string } | null {
  const withScheme = url.match(/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?(\/.*)$/i)
  if (withScheme) return { host: withScheme[1], path: withScheme[2] }
  // scp-like: [user@]host:path. A colon before any slash, and not a Windows drive letter.
  const scpLike = url.match(/^(?:[^@/:]+@)?([^/:]{2,}):(?!\/)(.+)$/)
  if (scpLike) return { host: scpLike[1], path: scpLike[2] }
  return null
}

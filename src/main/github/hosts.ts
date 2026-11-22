import { badResponse } from './errors'

/**
 * The hosts `gh` is logged into, from `gh auth status --json hosts`: each with an active
 * account whose token works, lower-cased. Only these are ever asked about a repository, so a
 * remote on GitLab or anywhere else never has its branch names sent there.
 */
export function parseLoggedInHosts(json: unknown): Set<string> {
  if (!isRecord(json) || !isRecord(json.hosts)) throw badResponse('no hosts.')
  const hosts = new Set<string>()
  for (const [host, accounts] of Object.entries(json.hosts)) {
    if (!Array.isArray(accounts)) throw badResponse(`no accounts for ${host}.`)
    const loggedIn = accounts.some(
      (account: unknown) =>
        isRecord(account) && account.active === true && account.state === 'success'
    )
    if (loggedIn) hosts.add(host.toLowerCase())
  }
  return hosts
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

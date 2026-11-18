import type { PublishTarget } from './git'

/**
 * The remote the Publish Branch dialog starts on: the one a **gone** upstream was on, else
 * `origin`, else the first alphabetically (`remotes` is already sorted). Null with no remotes.
 */
export function defaultPublishRemote(target: PublishTarget): string | null {
  const names = target.remotes.map((remote) => remote.name)
  if (target.goneFrom !== null && names.includes(target.goneFrom)) return target.goneFrom
  if (names.includes('origin')) return 'origin'
  return names[0] ?? null
}

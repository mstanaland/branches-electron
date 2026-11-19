import { TriangleAlert } from 'lucide-react'
import type { FileStatus } from '../../../shared/git'
import { Badge } from '../ui'
import type { BadgeVariant } from '../ui'

/** What a badge can show: a file status on one side, or "untracked" (which has no side). */
export type BadgeStatus = Exclude<FileStatus, 'unmodified'> | 'untracked'

export type Side = 'staged' | 'unstaged'

const DISPLAY: Record<BadgeStatus, { letter: string; variant: BadgeVariant; name: string }> = {
  added: { letter: 'A', variant: 'success', name: 'Added' },
  modified: { letter: 'M', variant: 'warning', name: 'Modified' },
  deleted: { letter: 'D', variant: 'destructive', name: 'Deleted' },
  renamed: { letter: 'R', variant: 'info', name: 'Renamed' },
  copied: { letter: 'C', variant: 'info', name: 'Copied' },
  typeChanged: { letter: 'T', variant: 'secondary', name: 'Type changed' },
  untracked: { letter: '?', variant: 'secondary', name: 'Untracked' },
  unmerged: { letter: '', variant: 'destructive', name: 'Conflict' }
}

/**
 * The accessible name of a badge, e.g. "Modified (staged)". Untracked and conflict have no
 * side, and neither does a file a commit changed, which passes no `side`.
 */
export function statusLabel(status: BadgeStatus, side?: Side): string {
  const { name } = DISPLAY[status]
  return side === undefined || status === 'untracked' || status === 'unmerged'
    ? name
    : `${name} (${side})`
}

/** One side of a change as a colored letter. A conflict shows a warning icon instead. */
export function StatusBadge({
  status,
  side
}: {
  status: BadgeStatus
  /** Which side of a working change it is. Left out for a file a commit changed. */
  side?: Side
}): React.JSX.Element {
  const { letter, variant } = DISPLAY[status]
  return (
    <Badge variant={variant} role="img" aria-label={statusLabel(status, side)}>
      {status === 'unmerged' ? <TriangleAlert aria-hidden="true" /> : letter}
    </Badge>
  )
}

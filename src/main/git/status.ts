import type { FileChange, FileStatus, RepositoryStatus } from '../../shared/git'
import { runGit } from './run'

export async function getStatus(root: string): Promise<RepositoryStatus> {
  const { stdout } = await runGit(root, [
    'status',
    '--porcelain=v2',
    '--branch',
    '--untracked-files=all',
    '-z'
  ])
  return parseStatus(stdout)
}

const STATUS_BY_CODE: Record<string, FileStatus> = {
  '.': 'unmodified',
  M: 'modified',
  T: 'typeChanged',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'unmerged'
}

/**
 * Parses `git status --porcelain=v2 --branch -z`.
 *
 * Under `-z`, every header and entry is NUL-terminated. A rename/copy entry
 * (type `2`) is followed by one extra NUL-terminated field: the original
 * path. Missing that desynchronizes every entry after the first rename.
 */
export function parseStatus(output: string): RepositoryStatus {
  const records = output.split('\0')
  const status: RepositoryStatus = {
    branch: null,
    headOid: null,
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    changes: []
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (!record) continue

    if (record.startsWith('# ')) {
      parseHeader(record, status)
      continue
    }

    switch (record[0]) {
      case '1': {
        const change = parseOrdinary(record)
        if (change) status.changes.push(change)
        break
      }
      case '2': {
        // The next record is the original path of the rename/copy.
        const originalPath = records[++i] ?? ''
        const change = parseRenameOrCopy(record, originalPath)
        if (change) status.changes.push(change)
        break
      }
      case 'u': {
        const change = parseUnmerged(record)
        if (change) status.changes.push(change)
        break
      }
      case '?':
        status.changes.push(simpleChange(record.slice(2), 'untracked'))
        break
      case '!':
        status.changes.push(simpleChange(record.slice(2), 'ignored'))
        break
    }
  }

  return status
}

function parseHeader(record: string, status: RepositoryStatus): void {
  const [, key, ...rest] = record.split(' ')
  const value = rest.join(' ')
  switch (key) {
    case 'branch.oid':
      status.headOid = value === '(initial)' ? null : value.slice(0, 7)
      break
    case 'branch.head':
      status.detached = value === '(detached)'
      status.branch = status.detached ? null : value
      break
    case 'branch.upstream':
      status.upstream = value
      break
    case 'branch.ab':
      for (const token of rest) {
        const count = Number(token.slice(1))
        if (token.startsWith('+')) status.ahead = count
        if (token.startsWith('-')) status.behind = count
      }
      break
  }
}

/**
 * Splits off the first `count` space-separated fields. The remainder is kept
 * whole because only the trailing path field can contain spaces.
 */
function splitFields(record: string, count: number): string[] | null {
  const fields: string[] = []
  let rest = record
  for (let i = 0; i < count; i++) {
    const space = rest.indexOf(' ')
    if (space === -1) return null
    fields.push(rest.slice(0, space))
    rest = rest.slice(space + 1)
  }
  fields.push(rest)
  return fields
}

function statuses(xy: string): { index: FileStatus | null; worktree: FileStatus | null } {
  return { index: STATUS_BY_CODE[xy[0]] ?? null, worktree: STATUS_BY_CODE[xy[1]] ?? null }
}

// "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
function parseOrdinary(record: string): FileChange | null {
  const fields = splitFields(record, 8)
  if (!fields) return null
  return { path: fields[8], originalPath: null, ...statuses(fields[1]), kind: 'ordinary' }
}

// "2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>"
function parseRenameOrCopy(record: string, originalPath: string): FileChange | null {
  const fields = splitFields(record, 9)
  if (!fields) return null
  return { path: fields[9], originalPath, ...statuses(fields[1]), kind: 'renamed' }
}

// "u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>"
function parseUnmerged(record: string): FileChange | null {
  const fields = splitFields(record, 10)
  if (!fields) return null
  return { path: fields[10], originalPath: null, ...statuses(fields[1]), kind: 'unmerged' }
}

function simpleChange(path: string, kind: 'untracked' | 'ignored'): FileChange {
  return { path, originalPath: null, index: null, worktree: null, kind }
}

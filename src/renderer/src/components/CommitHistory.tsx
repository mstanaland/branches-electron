import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { MAX_LANES, buildCommitGraph } from '../../../shared/commitGraph'
import type { CommitGraphRow } from '../../../shared/commitGraph'
import type { Commit } from '../../../shared/git'
import { describeError, useCommits } from '../data'
import { EmptyState, Pending } from '../ui'
import shared from './shared.module.css'
import styles from './CommitHistory.module.css'

/** Must match `--row-height` in the stylesheet: the SVG is sized in script, not by CSS. */
const ROW_HEIGHT = 48
const LANE_WIDTH = 14
const NODE_RADIUS = 4

/** Built once: an `Intl` formatter per row would be the most expensive thing on screen. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' })

/** Centre of a lane. Lanes past the cap pile up in the last one rather than widen the column. */
function laneX(lane: number): number {
  return Math.min(lane, MAX_LANES - 1) * LANE_WIDTH + LANE_WIDTH / 2
}

function laneColor(lane: number): string {
  return `var(--graph-lane-${(lane % MAX_LANES) + 1})`
}

/**
 * An edge between two lanes, bending in the half-row above or below the node. Drawn as a
 * cubic with both control points level with the midpoint, which gives the S the eye reads
 * as one line stepping across.
 */
function edgePath(fromX: number, fromY: number, toX: number, toY: number): string {
  const middle = (fromY + toY) / 2
  return `M ${fromX} ${fromY} C ${fromX} ${middle}, ${toX} ${middle}, ${toX} ${toY}`
}

/**
 * The graph cell of one row. Each row draws only its own segments, so the list can grow by a
 * page without anything already on screen being redrawn or realigned.
 */
function GraphCell({
  row,
  laneCount
}: {
  row: CommitGraphRow
  laneCount: number
}): React.JSX.Element {
  const width = Math.max(laneCount, 1) * LANE_WIDTH
  const middle = ROW_HEIGHT / 2
  const nodeX = laneX(row.lane)

  return (
    <svg
      className={styles.graph}
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      aria-hidden="true"
    >
      {row.through.map((lane) => (
        <line
          key={`through-${lane}`}
          x1={laneX(lane)}
          y1={0}
          x2={laneX(lane)}
          y2={ROW_HEIGHT}
          stroke={laneColor(lane)}
          strokeWidth={2}
        />
      ))}
      {row.into.map((lane) => (
        <path
          key={`into-${lane}`}
          d={edgePath(laneX(lane), 0, nodeX, middle)}
          stroke={laneColor(lane)}
          strokeWidth={2}
          fill="none"
        />
      ))}
      {row.out.map((lane, index) => (
        <path
          key={`out-${lane}-${index}`}
          d={edgePath(nodeX, middle, laneX(lane), ROW_HEIGHT)}
          stroke={laneColor(lane)}
          strokeWidth={2}
          fill="none"
        />
      ))}
      <circle cx={nodeX} cy={middle} r={NODE_RADIUS} fill={laneColor(row.lane)} />
    </svg>
  )
}

function CommitRow({
  commit,
  row,
  laneCount,
  selected,
  tabStop,
  onSelect,
  onKeyDown
}: {
  commit: Commit
  row: CommitGraphRow
  laneCount: number
  selected: boolean
  tabStop: boolean
  onSelect: () => void
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void
}): React.JSX.Element {
  return (
    <li
      data-oid={commit.oid}
      data-selected={selected ? 'true' : undefined}
      className={styles.row}
      tabIndex={tabStop ? 0 : -1}
      onClick={onSelect}
      onFocus={onSelect}
      onKeyDown={onKeyDown}
    >
      <GraphCell row={row} laneCount={laneCount} />
      <div className={styles.details}>
        <div className={styles.line}>
          <span className={styles.author}>{commit.authorName}</span>
          <span className={styles.date}>{formatDate(commit.authorDate)}</span>
        </div>
        <div className={styles.line}>
          <span className={styles.oid}>{commit.shortOid}</span>
          <span className={styles.subject}>{commit.subject}</span>
        </div>
      </div>
    </li>
  )
}

/** Git's dates are ISO 8601, but a repository can carry one no `Date` can parse. */
function formatDate(authorDate: string): string {
  const date = new Date(authorDate)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}

/**
 * The commits of one branch, newest first, with the lanes that connect them.
 *
 * `commitRef` is a branch name, or the oid of a detached HEAD. Remounting on it (a `key` at
 * the call site) isn't needed: the query is keyed by the ref, so switching branch swaps the
 * data and the scroll position starts again at the top of a fresh list.
 */
export function CommitHistory({
  root,
  commitRef
}: {
  root: string
  commitRef: string
}): React.JSX.Element | null {
  const commits = useCommits(root, commitRef)
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = commits

  const listed = useMemo(() => commits.data?.pages.flat() ?? [], [commits.data])
  // Recomputed over the whole list on every append rather than continued page by page: a
  // lane that started mid-page would otherwise land in a different position each time.
  const graph = useMemo(() => buildCommitGraph(listed), [listed])

  const [selectedOid, setSelectedOid] = useState<string | null>(null)
  const selectedIndex = listed.findIndex((commit) => commit.oid === selectedOid)
  // One tab stop for the whole list: the selected row, or the first one.
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex

  const listRef = useRef<HTMLUListElement>(null)

  /** Moves the highlight, and the focus with it, so the two never drift apart. */
  const moveTo = useCallback(
    (index: number): void => {
      const commit = listed[index]
      if (commit === undefined) return
      setSelectedOid(commit.oid)
      const row = listRef.current?.querySelector<HTMLElement>(`[data-oid="${commit.oid}"]`)
      row?.focus()
      // Optional: jsdom has no scrolling, and a row that can't be scrolled to is still focused.
      row?.scrollIntoView?.({ block: 'nearest' })
    },
    [listed]
  )

  const onKeyDown = useCallback(
    (index: number) =>
      (event: KeyboardEvent<HTMLLIElement>): void => {
        const target: Record<string, number | undefined> = {
          ArrowDown: index + 1,
          ArrowUp: index - 1,
          Home: 0,
          End: listed.length - 1
        }
        const next = target[event.key]
        if (next === undefined) return
        event.preventDefault()
        moveTo(next)
      },
    [listed.length, moveTo]
  )

  // Asks for the next page when the end of the list comes into view. An observer rather than
  // a scroll handler, so nothing runs while the user is in the middle of the list.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = sentinel.current
    if (element === null || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
    // Re-run when a page lands: the observer only reports a change, so a sentinel still in
    // view after an append needs a fresh one to ask for the page after it.
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const error = describeError(commits.error)
  // "Repository not found" belongs to the pane that owns the repository, not to this list.
  if (error?.notARepository) return null

  return (
    <section className={styles.history} aria-label="History">
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
      {/* The first page only. It fades in late, since a local log usually answers in
          milliseconds and a spinner that flashes and goes is worse than a list that simply
          appears; a large repository still shows it is reading rather than empty. */}
      {commits.isPending && !error && <Pending label="Loading history" />}
      {commits.isSuccess && listed.length === 0 && <EmptyState title="No commits yet." />}
      {listed.length > 0 && (
        <ul ref={listRef} className={styles.list} aria-label="Commits">
          {listed.map((commit, index) => (
            <CommitRow
              key={commit.oid}
              commit={commit}
              row={graph.rows[index]}
              laneCount={graph.laneCount}
              selected={commit.oid === selectedOid}
              tabStop={index === tabStopIndex}
              onSelect={() => setSelectedOid(commit.oid)}
              onKeyDown={onKeyDown(index)}
            />
          ))}
        </ul>
      )}
      {/* Reaching this asks for another page. The end of the list is silent: it just stops. */}
      <div ref={sentinel} className={styles.sentinel} />
    </section>
  )
}

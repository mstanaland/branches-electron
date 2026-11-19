import { useState } from 'react'

/** The columns with a draggable boundary on their right. The last column takes the rest. */
/**
 * `changes` is Working's list of changes and `history` the History view's commit list: the
 * same place in the window, but they hold different things, so each keeps its own width.
 */
export type ResizableColumn = 'sidebar' | 'changes' | 'history'

export type ColumnWidths = Readonly<Record<ResizableColumn, number>>

/** What a first launch shows, and what double-clicking a boundary goes back to. */
export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { sidebar: 260, changes: 360, history: 500 }

/**
 * The narrowest each column may be, so a stray drag cannot collapse one. Together they fit
 * the window's minimum width (800 in main), so every column can always meet its minimum:
 * sidebar + history + commit details is the widest set, at 800.
 */
export const MIN_COLUMN_WIDTHS: Readonly<
  Record<ResizableColumn | 'diff' | 'commitDetails', number>
> = {
  sidebar: 180,
  changes: 220,
  diff: 300,
  history: 320,
  commitDetails: 300
}

const STORAGE_KEY = 'branches.columnWidths'

/**
 * localStorage can be missing or throw, and its contents can be stale or hand-edited: any
 * width that isn't a usable number starts at its default. One saved below its minimum is
 * raised to it, which is where the grid would draw it anyway.
 */
function readStored(): ColumnWidths {
  let data: unknown = null
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    data = text === null ? null : JSON.parse(text)
  } catch {
    // Unreadable: every column at its default.
  }
  const stored = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const read = (column: ResizableColumn): number => {
    const width = stored[column]
    return typeof width === 'number' && Number.isFinite(width)
      ? Math.max(MIN_COLUMN_WIDTHS[column], Math.round(width))
      : DEFAULT_COLUMN_WIDTHS[column]
  }
  return { sidebar: read('sidebar'), changes: read('changes'), history: read('history') }
}

function writeStored(widths: ColumnWidths): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // Not remembered next launch; resizing still works.
  }
}

export interface ColumnWidthState {
  widths: ColumnWidths
  setWidth: (column: ResizableColumn, width: number) => void
  resetWidth: (column: ResizableColumn) => void
}

/**
 * The widths the user has dragged the columns to. They belong to the window, not to a tab or
 * a repository, so switching tabs never rearranges the layout, and they persist across
 * launches.
 */
export function useColumnWidths(): ColumnWidthState {
  const [widths, setWidths] = useState<ColumnWidths>(readStored)

  const setWidth = (column: ResizableColumn, width: number): void => {
    // Built from the latest widths, not the render's copy, so a drag's rapid moves all land.
    // The write is idempotent, so a repeated updater run is harmless.
    setWidths((latest) => {
      const next = { ...latest, [column]: width }
      writeStored(next)
      return next
    })
  }

  return {
    widths,
    setWidth,
    resetWidth: (column) => setWidth(column, DEFAULT_COLUMN_WIDTHS[column])
  }
}

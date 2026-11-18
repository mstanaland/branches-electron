import { useRef, useState } from 'react'
import styles from './ResizeHandle.module.css'

/** How far one arrow-key press moves the boundary, in pixels. */
const STEP = 10

export interface ResizeHandleProps {
  /** The accessible name: what the handle resizes, such as "Sidebar width". */
  'aria-label': string
  /** The width of the column before the handle, in pixels. */
  value: number
  /** The narrowest the column may be. */
  min: number
  /**
   * The widest the column may be right now, given the room the columns after it need. Omit
   * when there is no limit. `value` above it is treated as it, so a column the window has
   * squeezed resizes from where it is drawn rather than from where it was left.
   */
  max?: number
  /** The width a drag or a key asks for, already clamped to `min` and `max`. */
  onValueChange: (value: number) => void
  /** Double-click: put the column back to its default width. */
  onReset: () => void
  className?: string
}

/**
 * A vertical column boundary that can be dragged, or nudged with the arrow keys once focused.
 * Exposed as a focusable `separator` whose value is the width of the column before it.
 *
 * Base UI has no splitter primitive, so this is built on pointer events directly. It draws no
 * layout of its own: the caller places it on the boundary and sizes the columns from `value`.
 */
export function ResizeHandle({
  value,
  min,
  max = Number.POSITIVE_INFINITY,
  onValueChange,
  onReset,
  className,
  ...props
}: ResizeHandleProps): React.JSX.Element {
  const clamp = (width: number): number => Math.round(Math.max(min, Math.min(max, width)))
  const current = clamp(value)
  // Where the drag started, so each move is measured from there rather than accumulating
  // rounding from one move to the next.
  const drag = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null)
  // Mirrors `drag` for rendering: the boundary stays highlighted while it is held.
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    // Keep the current focus and prevent text selection while dragging.
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startValue: current }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = drag.current
    if (start === null || start.pointerId !== event.pointerId) return
    const next = clamp(start.startValue + event.clientX - start.startX)
    if (next !== current) onValueChange(next)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.key === 'ArrowLeft' ? -STEP : event.key === 'ArrowRight' ? STEP : 0
    if (delta === 0) return
    event.preventDefault()
    const next = clamp(current + delta)
    if (next !== current) onValueChange(next)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={current}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(max) ? Math.round(max) : undefined}
      tabIndex={0}
      className={className ? `${styles.handle} ${className}` : styles.handle}
      data-dragging={dragging ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      {...props}
    />
  )
}

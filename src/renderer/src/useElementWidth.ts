import { useEffect, useState } from 'react'

/**
 * The rendered width of an element, kept current as it resizes. Returns a callback ref to put
 * on the element, and its width in pixels — or null until it is measured, and wherever there
 * is no `ResizeObserver` to measure with (jsdom, in tests).
 */
export function useElementWidth<T extends Element>(): [
  ref: (element: T | null) => void,
  width: number | null
] {
  // The element itself rather than a ref object, so a remount (a keyed subtree, a tab
  // switch) re-observes the new node instead of watching one that has left the document.
  const [element, setElement] = useState<T | null>(null)
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return [setElement, element === null ? null : width]
}

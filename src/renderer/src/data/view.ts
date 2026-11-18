/**
 * What one **repository tab** is showing beside its branches (see ADR 0006). One value with
 * three kinds, rather than separate flags, so it can't be showing two things at once or
 * nothing at all. A view lives inside a tab; the tab is the horizontal strip above.
 */
export type View =
  | { kind: 'working' }
  | { kind: 'branch'; name: string }
  /** HEAD is detached, and the user picked the row standing in for it. */
  | { kind: 'detached'; oid: string }

/** Where a tab starts, and where it falls back to. Always available. */
export const WORKING: View = { kind: 'working' }

/** The ref a view asks git for, or null for Working, which asks for no history. */
export function viewRef(view: View): string | null {
  switch (view.kind) {
    case 'working':
      return null
    case 'branch':
      return view.name
    case 'detached':
      return view.oid
  }
}

/** True when both views are the same thing, for marking the selected row. */
export function isSameView(a: View, b: View): boolean {
  return a.kind === b.kind && viewRef(a) === viewRef(b)
}

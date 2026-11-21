import { useCallback, useState } from 'react'

/** What the user has typed into a repository's commit form but not yet committed. */
export interface Draft {
  subject: string
  description: string
  /** Whether the form is showing the description. Remembered with the text itself. */
  expanded: boolean
}

const EMPTY: Draft = { subject: '', description: '', expanded: false }

/**
 * One draft per repository, held for as long as the app runs. It lives outside React because
 * the commit form is keyed on the repository root and so remounts on a switch; a state hook
 * inside it would lose the draft exactly when the user expects it back. Not persisted across
 * launches — a draft is a few seconds of typing, not a document.
 */
const drafts = new Map<string, Draft>()

/**
 * Puts a whole message into `root`'s draft from outside the form — **Generate**'s answer, which
 * can arrive while the form is not mounted. A mounted form shows it on its next render.
 */
export function setDraftMessage(
  root: string,
  message: { subject: string; description: string }
): void {
  drafts.set(root, { ...(drafts.get(root) ?? EMPTY), ...message })
}

/** Test helper: forgets every draft. */
export function clearAllDrafts(): void {
  drafts.clear()
}

export interface DraftState {
  draft: Draft
  setSubject: (subject: string) => void
  setDescription: (description: string) => void
  setExpanded: (expanded: boolean) => void
  /** Empties the draft and collapses the form, after a commit has landed. */
  clear: () => void
}

/** `root`'s draft, remembered across repository switches and across the form remounting. */
export function useDraft(root: string): DraftState {
  const [, bumpVersion] = useState(0)

  const update = useCallback(
    (change: Partial<Draft>) => {
      // Read from the store, not from a render's copy, so two changes in one event both land.
      drafts.set(root, { ...(drafts.get(root) ?? EMPTY), ...change })
      bumpVersion((version) => version + 1)
    },
    [root]
  )

  const setSubject = useCallback((subject: string) => update({ subject }), [update])
  const setDescription = useCallback((description: string) => update({ description }), [update])
  const setExpanded = useCallback((expanded: boolean) => update({ expanded }), [update])
  const clear = useCallback(() => update(EMPTY), [update])

  return { draft: drafts.get(root) ?? EMPTY, setSubject, setDescription, setExpanded, clear }
}

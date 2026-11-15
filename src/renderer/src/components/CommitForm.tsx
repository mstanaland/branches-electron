import { useCallback, useEffect, useRef } from 'react'
import { describeError, useCommit, useDraft } from '../data'
import type { StageAll } from '../data/staging'
import { Button, Kbd, TextField, Tooltip } from '../ui'
import shared from './shared.module.css'
import styles from './CommitForm.module.css'

export interface CommitFormProps {
  root: string
  /** Whether anything at all is in the index. With nothing staged there is nothing to commit. */
  hasStaged: boolean
  /** The pane's stage-all button, which lives in this form's button row. Null when it is hidden. */
  stageAll: StageAll | null
  /**
   * Called once a commit has landed, so the pane can move focus to the changes list.
   * Focus has to leave the form: the subject expands on focus, so leaving it focused would
   * reopen the form this commit just closed.
   */
  onCommitted: () => void
}

/**
 * Where the user writes and sends a commit. Pinned above the changes list and shown for every
 * active repository, a clean one and one with no commits included.
 *
 * Collapsed it shows the commit subject and the button row; focus on the subject reveals the
 * commit description. That is focus, not a click, so Tab from the subject reaches the
 * description. It is deliberately not an accordion: `aria-expanded` on a text input announces
 * a combobox and sends screen readers looking for a listbox, and since focus reveals the
 * description before a keyboard user can reach it, nothing is ever hidden from them.
 */
export function CommitForm({
  root,
  hasStaged,
  stageAll,
  onCommitted
}: CommitFormProps): React.JSX.Element {
  const { draft, setSubject, setDescription, setExpanded, clear } = useDraft(root)
  const commit = useCommit(root)
  const formRef = useRef<HTMLFormElement>(null)
  const descriptionRef = useRef<HTMLElement>(null)

  const hasSubject = draft.subject.trim() !== ''
  // Each reason the Commit button is dead, in the order the user can act on them.
  const reason = !hasStaged ? 'Nothing is staged' : !hasSubject ? 'Add a subject' : null
  const canCommit = reason === null && !commit.isPending
  const error = describeError(commit.error)

  const hasDescription = draft.description !== ''
  const collapseIfEmpty = useCallback(() => {
    // A non-empty description keeps the form open, so collapsing can never hide typing.
    if (!hasDescription) setExpanded(false)
  }, [hasDescription, setExpanded])

  // The pointer going elsewhere is what collapses the form. A click inside it — Stage All,
  // the padding, either field — leaves it alone, and so does a click that starts here.
  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const form = formRef.current
      if (form === null || form.contains(event.target as Node)) return
      collapseIfEmpty()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [collapseIfEmpty])

  const runCommit = useCallback(() => {
    if (!canCommit) return
    commit.mutate(
      { subject: draft.subject, description: draft.description },
      {
        onSuccess: () => {
          clear()
          onCommitted()
        }
      }
    )
  }, [canCommit, commit, draft.subject, draft.description, clear, onCommitted])

  return (
    <form
      ref={formRef}
      aria-label="Commit"
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        runCommit()
      }}
      onKeyDown={(event) => {
        // Cmd+Enter commits from anywhere in the form. The write queue would serialise a
        // double-tap into two commits rather than refuse the second, so it is stopped here.
        if (event.key !== 'Enter' || !event.metaKey) return
        event.preventDefault()
        runCommit()
      }}
    >
      <TextField
        label="Commit subject"
        placeholder="Subject"
        value={draft.subject}
        onValueChange={setSubject}
        onFocus={() => setExpanded(true)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.metaKey) return
          // Enter would submit the form; it moves on to the description instead.
          event.preventDefault()
          descriptionRef.current?.focus()
        }}
      />
      {draft.expanded && (
        <TextField
          ref={descriptionRef}
          multiline
          rows={3}
          label="Commit description"
          placeholder="Description"
          value={draft.description}
          onValueChange={setDescription}
        />
      )}
      <div className={styles.actions}>
        {stageAll && <Button onClick={stageAll.run}>{stageAll.label}</Button>}
        <Tooltip content={reason}>
          <Button
            type="submit"
            variant="primary"
            className={styles.commit}
            disabled={!canCommit}
            // Disabled, it is the only thing that can explain why, so it stays reachable.
            focusableWhenDisabled
          >
            Commit
            <Kbd>⌘↵</Kbd>
          </Button>
        </Tooltip>
      </div>
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
    </form>
  )
}

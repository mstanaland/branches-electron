import { LoaderCircle, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError, useCommit, useDraft, useGenerateCommitMessage } from '../data'
import type { StageAll } from '../data'
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
 * Where the user writes and sends a commit. Sits above the changes list and is shown for every
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
  const generation = useGenerateCommitMessage(root)
  const formRef = useRef<HTMLFormElement>(null)
  const subjectRef = useRef<HTMLElement>(null)
  const descriptionRef = useRef<HTMLElement>(null)

  const generating = generation.isPending
  const hasSubject = draft.subject.trim() !== ''
  // Each reason the Commit button is dead, in the order the user can act on them.
  // While Generate runs the fields are locked, so that comes first: nothing else is actionable.
  const reason = generating
    ? 'Generating a commit message'
    : !hasStaged
      ? 'Nothing is staged'
      : !hasSubject
        ? 'Add a subject'
        : null
  const canCommit = reason === null && !commit.isPending
  const error = describeError(commit.error)

  const hasDescription = draft.description !== ''
  const collapseIfEmpty = useCallback(() => {
    // A non-empty description keeps the form open, so collapsing can never hide typing.
    if (!hasDescription) setExpanded(false)
  }, [hasDescription, setExpanded])

  // Set when the pointer went down outside the form while the form still held focus. The
  // browser is about to move focus off; the collapse waits for that, so both halves of the
  // rule — focus has left, and the pointer went elsewhere — are true before it happens.
  const pointerWentOutside = useRef(false)

  // A click inside the form — Stage All, the padding, either field — never collapses it.
  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const form = formRef.current
      if (form === null) return
      if (form.contains(event.target as Node)) {
        pointerWentOutside.current = false
        return
      }
      if (form.contains(document.activeElement)) {
        pointerWentOutside.current = true
        return
      }
      collapseIfEmpty()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [collapseIfEmpty])

  const onBlur = useCallback(
    (event: React.FocusEvent<HTMLFormElement>) => {
      const form = formRef.current
      // Focus only moved between the form's own controls.
      if (form !== null && form.contains(event.relatedTarget)) return
      // Tabbing out on its own leaves the form open: the pointer never went anywhere.
      if (!pointerWentOutside.current) return
      pointerWentOutside.current = false
      collapseIfEmpty()
    },
    [collapseIfEmpty]
  )

  // Bumped when Generate fills the draft. The subject is focused and selected once that text
  // has rendered, so the selection covers the new subject rather than the old one.
  const [generatedCount, setGeneratedCount] = useState(0)
  useEffect(() => {
    if (generatedCount === 0) return
    const field = subjectRef.current
    if (!(field instanceof HTMLInputElement)) return
    field.focus()
    field.select()
  }, [generatedCount])

  const runGenerate = useCallback(() => {
    if (!hasStaged || generating) return
    // The answer goes into the draft store either way; this re-renders to show it and select it.
    generation.generate({ subject: draft.subject, description: draft.description }, () =>
      setGeneratedCount((count) => count + 1)
    )
  }, [hasStaged, generating, generation, draft.subject, draft.description])

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
      onBlur={onBlur}
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
        ref={subjectRef}
        label="Commit subject"
        placeholder="Subject"
        // Locked while Generate runs, so its answer never lands on top of fresh typing.
        readOnly={generating}
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
          readOnly={generating}
          value={draft.description}
          onValueChange={setDescription}
        />
      )}
      {draft.expanded && (
        <div className={styles.generate}>
          {generating ? (
            <>
              <Button onClick={generation.stop}>Stop</Button>
              <span role="status" className={styles.generating}>
                <LoaderCircle className={shared.spinner} />
                Generating…
              </span>
            </>
          ) : (
            <Tooltip content={hasStaged ? null : 'Nothing is staged'}>
              <Button
                onClick={runGenerate}
                disabled={!hasStaged}
                // Disabled, it is the only thing that can explain why, so it stays reachable.
                focusableWhenDisabled
              >
                <Sparkles />
                Generate
              </Button>
            </Tooltip>
          )}
        </div>
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

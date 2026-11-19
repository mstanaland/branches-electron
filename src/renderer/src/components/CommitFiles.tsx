import { ArrowRight } from 'lucide-react'
import type { Commit, CommitFile, CommitFileKind } from '../../../shared/git'
import { describeError, useCommitFileDiff, useCommitFiles, useDelayed } from '../data'
import { Accordion, AccordionItem, EmptyState, Pending } from '../ui'
import { diffSummary } from './diffSummary'
import { FileDiffView } from './FileDiffView'
import { StatusBadge } from './StatusBadge'
import shared from './shared.module.css'
import styles from './CommitFiles.module.css'

/** How long a read may take before its pending state shows, like the rest of commit details. */
const PENDING_DELAY_MS = 400

const KIND_WORDS: Record<CommitFileKind, string> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
  renamed: 'renamed',
  typeChanged: 'type changed'
}

/** A row's title: the change kind as a word and as a badge, then the path, `old → new` for a rename. */
function FileTitle({ file }: { file: CommitFile }): React.JSX.Element {
  return (
    <span className={styles.title}>
      <span className={styles.kind} data-kind={file.kind}>
        {KIND_WORDS[file.kind]}
      </span>
      {/* The word already says it; the badge is the same thing at a glance. */}
      <span aria-hidden="true" className={styles.badge}>
        <StatusBadge status={file.kind} />
      </span>
      <span className={styles.path}>
        {file.originalPath !== null && (
          <>
            <span>{file.originalPath}</span>
            <ArrowRight role="img" aria-label="renamed to" className={styles.arrow} />
          </>
        )}
        <span>{file.path}</span>
      </span>
    </span>
  )
}

/** What an expanded row shows. Mounted only while expanded, which is when its diff is read. */
function FileChanges({
  root,
  oid,
  file
}: {
  root: string
  oid: string
  file: CommitFile
}): React.JSX.Element {
  const diff = useCommitFileDiff(root, oid, file.path, file.originalPath)
  const pending = useDelayed(diff.isPending, PENDING_DELAY_MS)
  const error = describeError(diff.error)

  if (error) {
    return (
      <p role="alert" className={`${shared.error} ${styles.changes}`}>
        {error.message}
      </p>
    )
  }
  if (!diff.data) {
    return <div className={styles.changes}>{pending && <Pending label="Loading diff" />}</div>
  }
  if (!diff.data.binary && diff.data.hunks.length === 0) {
    return (
      <div className={styles.changes}>
        <EmptyState title="No content changes" />
      </div>
    )
  }

  const summary = diffSummary(diff.data)
  return (
    <div className={styles.changes}>
      {summary !== null && <p className={styles.summary}>{summary}</p>}
      <FileDiffView diff={diff.data} label={`Changes to ${file.path}`} />
    </div>
  )
}

/**
 * The files a commit changed, under its description in **commit details**, each opening onto
 * its diff. All start collapsed, any number can be open, and they collapse again when a
 * different commit is shown. Only the list is read up front; each diff waits for its row.
 */
export function CommitFiles({ root, commit }: { root: string; commit: Commit }): React.JSX.Element {
  const files = useCommitFiles(root, commit.oid)
  const pending = useDelayed(files.isPending, PENDING_DELAY_MS)
  const error = describeError(files.error)
  const merge = commit.parents.length > 1

  return (
    <section className={styles.files} aria-label="Changed files">
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
      {pending && !error && <Pending label="Loading changed files" />}
      {files.data &&
        (files.data.length === 0 ? (
          <EmptyState title="No files changed" />
        ) : (
          <>
            {merge && (
              <p className={styles.note}>
                This merge’s changes are shown against its first parent.
              </p>
            )}
            {/* Keyed so a different commit starts with every row collapsed. */}
            <Accordion key={commit.oid}>
              {files.data.map((file) => (
                <AccordionItem key={file.path} title={<FileTitle file={file} />}>
                  <FileChanges root={root} oid={commit.oid} file={file} />
                </AccordionItem>
              ))}
            </Accordion>
          </>
        ))}
    </section>
  )
}

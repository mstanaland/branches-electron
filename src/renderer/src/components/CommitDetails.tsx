import type { Commit, CommitDetails as Details } from '../../../shared/git'
import { describeError, useCommitDetails, useCommits, useDelayed, useSelection } from '../data'
import { EmptyState, Pending } from '../ui'
import shared from './shared.module.css'
import styles from './CommitDetails.module.css'

/** How long a details read may take before its pending state shows, like the in-progress bar. */
const PENDING_DELAY_MS = 400

/** Built once: "November 18, 2026 at 5:34:25 AM EST" in the user's locale and time zone. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'long' })

/** Git's dates are ISO 8601, but a repository can carry one no `Date` can parse. */
function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date)
}

function person(name: string, email: string): string {
  return email === '' ? name : `${name} <${email}>`
}

/**
 * Committer and committer date, only when they say something the author rows don't: usually
 * the author committed their own work, and repeating them is noise. A squash merge on a
 * hosting service is the common case where they differ.
 */
function committerDiffers(details: Details): boolean {
  return (
    details.committerName !== details.authorName ||
    details.committerEmail !== details.authorEmail ||
    details.committerDate !== details.authorDate
  )
}

function Metadata({ details }: { details: Details }): React.JSX.Element {
  const rows: [string, string][] = [
    ['Author', person(details.authorName, details.authorEmail)],
    ['Author Date', formatDate(details.authorDate)]
  ]
  if (committerDiffers(details)) {
    rows.push(
      ['Committer', person(details.committerName, details.committerEmail)],
      ['Committer Date', formatDate(details.committerDate)]
    )
  }
  rows.push(['Commit ID', details.oid])

  return (
    <dl className={styles.metadata}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.row}>
          <dt className={styles.label}>{label}</dt>
          <dd className={label === 'Commit ID' ? styles.oid : styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Body({ root, commit }: { root: string; commit: Commit }): React.JSX.Element {
  const details = useCommitDetails(root, commit.oid)
  const pending = useDelayed(details.isPending, PENDING_DELAY_MS)
  const error = describeError(details.error)

  return (
    <div className={styles.body}>
      {error && (
        <p role="alert" className={shared.error}>
          {error.message}
        </p>
      )}
      {pending && !error && <Pending label="Loading commit details" />}
      {details.data && (
        <>
          <Metadata details={details.data} />
          {details.data.description !== '' && (
            <p className={styles.description}>{details.data.description}</p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * **Commit details**: what the history shows beside its list for the one selected commit.
 *
 * The subject comes from the list's own row, so it changes the moment the selection does;
 * the rest is read per commit and shows pending until it lands, never the previous commit's
 * details under the new subject.
 */
export function CommitDetails({
  root,
  commitRef
}: {
  root: string
  commitRef: string
}): React.JSX.Element {
  const { selectedCommit } = useSelection()
  // The same query the list is drawn from, so this reads its cache rather than git.
  const commits = useCommits(root, commitRef)
  const commit =
    selectedCommit === null
      ? undefined
      : commits.data?.pages.flat().find((candidate) => candidate.oid === selectedCommit)

  return (
    <section className={styles.pane} aria-label="Commit details">
      {commit === undefined ? (
        <EmptyState title="Select a commit to see its details" />
      ) : (
        <>
          <h2 className={styles.subject}>{commit.subject}</h2>
          {/* Keyed so a new commit starts with no details rather than the last one's. */}
          <Body key={commit.oid} root={root} commit={commit} />
        </>
      )}
    </section>
  )
}

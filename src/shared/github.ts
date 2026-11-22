/** Data types for what Branches learns from GitHub, shared by the main process and the renderer. */

/** A merged **pull request**, as GitHub reported it. */
export interface PullRequest {
  number: number
  title: string
  /** The pull request's page on GitHub, exactly as GitHub gave it. */
  url: string
  /** The branch it was merged into: always the repository's **default branch**. */
  baseBranch: string
  /** When it was merged, as an ISO 8601 timestamp. */
  mergedAt: string
}

/** A **merged branch** (ADR-0011): a local branch and the pull request that merged it. */
export interface MergedBranch {
  /** The local branch's name, which may differ from its upstream's. */
  name: string
  pullRequest: PullRequest
}

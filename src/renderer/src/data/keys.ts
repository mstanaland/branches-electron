/** Query keys for git state. Mutations invalidate through these so they hit exactly what changed. */
export const keys = {
  repositories: () => ['repositories'] as const,
  /** A fetch of one repository, as a mutation key, so the title bar can see one in flight. */
  fetch: (root: string) => ['repository', root, 'fetch'] as const,
  /** A pull of one repository, as a mutation key, so the title bar can see one in flight. */
  pull: (root: string) => ['repository', root, 'pull'] as const,
  /** A push of one repository, as a mutation key, so the title bar can see one in flight. */
  push: (root: string) => ['repository', root, 'push'] as const,
  /** A Publish Branch in one repository, as a mutation key. Under `repository(root)`, like every operation, so the in-progress bar sees it. */
  publish: (root: string) => ['repository', root, 'publish'] as const,
  /** A refresh of one repository, as a mutation key, so its control can see one in flight. */
  refresh: (root: string) => ['repository', root, 'refresh'] as const,
  /** Everything cached for one repository (status, branches, diffs), for invalidating it all. */
  repository: (root: string) => ['repository', root] as const,
  status: (root: string) => ['repository', root, 'status'] as const,
  branches: (root: string) => ['repository', root, 'branches'] as const,
  /** Where the current branch can be pushed or published: its remotes, and a gone upstream's. */
  publishTarget: (root: string) => ['repository', root, 'publish-target'] as const,
  /**
   * One branch's history. Keyed by the ref the user picked — a branch name, or the oid of a
   * detached HEAD — so switching between two branches keeps both their pages cached.
   */
  commits: (root: string, ref: string) => ['repository', root, 'commits', ref] as const,
  /** What **commit details** shows about one commit beyond its row. */
  commitDetails: (root: string, oid: string) =>
    ['repository', root, 'commit-details', oid] as const,
  /** The files one commit changed. */
  commitFiles: (root: string, oid: string) => ['repository', root, 'commit-files', oid] as const,
  /** The diff of one file one commit changed. `originalPath` is part of it, as for `diff`. */
  commitFileDiff: (root: string, oid: string, path: string, originalPath: string | null) =>
    ['repository', root, 'commit-file-diff', oid, path, originalPath] as const,
  /** Every cached history in one repository, whatever ref it is of. */
  commitsOfAny: (root: string) => ['repository', root, 'commits'] as const,
  /** The diffs of every change in one repository, for invalidating them together. */
  diffs: (root: string) => ['repository', root, 'diff'] as const,
  /** `originalPath` is part of the key because it changes what git is asked for (a rename). */
  diff: (root: string, path: string, originalPath: string | null) =>
    [...keys.diffs(root), path, originalPath] as const,
  /**
   * True for a cached diff of one of `paths`, so callers can invalidate just those without
   * knowing each change's `originalPath`. Keeps the key's layout in this file.
   */
  isDiffOfAny: (root: string, paths: Iterable<string>) => {
    const wanted = new Set(paths)
    const prefix = keys.diffs(root)
    return (queryKey: readonly unknown[]): boolean =>
      queryKey.length === prefix.length + 2 &&
      prefix.every((part, index) => queryKey[index] === part) &&
      wanted.has(queryKey[prefix.length] as string)
  }
}

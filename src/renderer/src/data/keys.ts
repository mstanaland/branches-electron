/** Query keys for git state. Mutations invalidate through these so they hit exactly what changed. */
export const keys = {
  repositories: () => ['repositories'] as const,
  /** Everything cached for one repository (status, branches, diffs), for invalidating it all. */
  repository: (root: string) => ['repository', root] as const,
  status: (root: string) => ['repository', root, 'status'] as const,
  branches: (root: string) => ['repository', root, 'branches'] as const,
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

/** Query keys for git state. Mutations invalidate through these so they hit exactly what changed. */
export const keys = {
  repositories: () => ['repositories'] as const,
  /** Everything for one repository (status, branches, and later queries), for invalidating it all. */
  repository: (root: string) => ['repository', root] as const,
  status: (root: string) => ['repository', root, 'status'] as const,
  branches: (root: string) => ['repository', root, 'branches'] as const
}

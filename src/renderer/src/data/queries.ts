import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { keys } from './keys'

/** The saved repositories. Refetches on window focus, which recomputes each `missing` flag. */
export function useRepositories() {
  return useQuery({ queryKey: keys.repositories(), queryFn: () => api.listRepositories() })
}

/** Status of the active repository. Idle while `root` is null. A refetch keeps the old data on screen; a different repository starts empty. */
export function useStatus(root: string | null) {
  return useQuery({
    queryKey: keys.status(root ?? ''),
    queryFn: () => api.getStatus(root as string),
    enabled: root !== null
  })
}

/**
 * Where the active repository's **current branch** can go — its remotes, and the remote a
 * **gone** upstream was on — for Push and the Publish Branch dialog. Idle while `root` is null.
 */
export function usePublishTarget(root: string | null) {
  return useQuery({
    queryKey: keys.publishTarget(root ?? ''),
    queryFn: () => api.getPublishTarget(root as string),
    enabled: root !== null
  })
}

/** Branches of the active repository. Idle while `root` is null. A refetch keeps the old data on screen; a different repository starts empty. */
export function useBranches(root: string | null) {
  return useQuery({
    queryKey: keys.branches(root ?? ''),
    queryFn: () => api.listBranches(root as string),
    enabled: root !== null
  })
}

/**
 * The **merged branches** of the active repository, by local branch name. Idle while `root` is
 * null. Read when the repository is first shown in a tab, then kept until main says the result
 * changed (see `useBackgroundFetch`): main holds the last answer, and a fetch, a Refresh,
 * regaining focus or a delete asks GitHub again. A failure is never shown — merged marks are a nicety.
 */
export function useMergedBranches(root: string | null) {
  return useQuery({
    queryKey: keys.mergedBranches(root ?? ''),
    queryFn: async () => {
      const merged = await api.listMergedBranches(root as string)
      return new Map(merged.map((branch) => [branch.name, branch.pullRequest]))
    },
    enabled: root !== null,
    staleTime: Infinity,
    retry: false
  })
}

/**
 * The staged and unstaged diffs of one change in the active repository. Idle while there is no
 * repository or no path. `originalPath` is the path a renamed file came from, else null.
 */
export function useDiff(root: string | null, path: string | null, originalPath: string | null) {
  return useQuery({
    queryKey: keys.diff(root ?? '', path ?? '', originalPath),
    queryFn: () => api.getDiff(root as string, path as string, originalPath),
    enabled: root !== null && path !== null
  })
}

/**
 * Author, committer and description of one commit, for **commit details**. Idle while there is
 * no repository or no commit selected. A commit never changes, so what was read stays good.
 */
export function useCommitDetails(root: string | null, oid: string | null) {
  return useQuery({
    queryKey: keys.commitDetails(root ?? '', oid ?? ''),
    queryFn: () => api.getCommitDetails(root as string, oid as string),
    enabled: root !== null && oid !== null,
    staleTime: Infinity
  })
}

/**
 * The files one commit changed, for **commit details**. Idle while there is no repository or
 * no commit. A commit never changes, so what was read stays good.
 */
export function useCommitFiles(root: string | null, oid: string | null) {
  return useQuery({
    queryKey: keys.commitFiles(root ?? '', oid ?? ''),
    queryFn: () => api.listCommitFiles(root as string, oid as string),
    enabled: root !== null && oid !== null,
    staleTime: Infinity
  })
}

/**
 * The diff of one file a commit changed. Mounted only when its row is expanded, so a commit's
 * diffs are read one at a time as they are opened rather than all up front.
 */
export function useCommitFileDiff(
  root: string,
  oid: string,
  path: string,
  originalPath: string | null
) {
  return useQuery({
    queryKey: keys.commitFileDiff(root, oid, path, originalPath),
    queryFn: () => api.getCommitFileDiff(root, oid, path, originalPath),
    staleTime: Infinity
  })
}

/**
 * The **unpushed commits** of one branch's history, as a set of full oids for the rows to look
 * themselves up in. Idle while there is no repository or no ref.
 */
export function useUnpushedCommits(root: string | null, ref: string | null) {
  // Main leaves out what a merged pull request carried, judged by the merged branches it holds.
  // So wait for them — success or failure — rather than mark a merged commit for a moment, and
  // read again when the pull request that merged this branch changes.
  const merged = useMergedBranches(root)
  const mergedHead = (ref === null ? undefined : merged.data?.get(ref)?.headOid) ?? null
  return useQuery({
    queryKey: keys.unpushed(root ?? '', ref ?? '', mergedHead),
    queryFn: async () => new Set(await api.listUnpushedCommits(root as string, ref as string)),
    enabled: root !== null && ref !== null && !merged.isPending
  })
}

/** Commits fetched per page. Big enough that scrolling rarely asks for another. */
export const COMMIT_PAGE_SIZE = 200

/** Where the next page starts, and which commit the whole list is anchored to. */
interface CommitPageParam {
  skip: number
  /**
   * Oid of the first page's first commit, used as the ref for every page after it. Null on
   * the first page, which is the one that resolves the branch.
   */
  anchor: string | null
}

/**
 * One branch's history, a page at a time. Idle while there is no repository or no ref.
 *
 * Pages after the first ask for the oid the first page started from rather than the branch
 * name. `--skip` counts back from the ref, so a branch that moves between pages would
 * otherwise shift every later page by the number of new commits — repeating or skipping
 * rows. Anchored, the list stays the one history the user started reading; a commit
 * invalidates the query, and the refetch starts again from the branch's new tip.
 */
export function useCommits(root: string | null, ref: string | null) {
  return useInfiniteQuery({
    queryKey: keys.commits(root ?? '', ref ?? ''),
    initialPageParam: { skip: 0, anchor: null } as CommitPageParam,
    queryFn: ({ pageParam }) =>
      api.listCommits(
        root as string,
        pageParam.anchor ?? (ref as string),
        COMMIT_PAGE_SIZE,
        pageParam.skip
      ),
    getNextPageParam: (lastPage, allPages): CommitPageParam | undefined => {
      // A short page is the end of the history.
      if (lastPage.length < COMMIT_PAGE_SIZE) return undefined
      const anchor = allPages[0][0]?.oid ?? null
      if (anchor === null) return undefined
      return { skip: allPages.reduce((total, page) => total + page.length, 0), anchor }
    },
    enabled: root !== null && ref !== null
  })
}

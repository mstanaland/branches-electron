import { mkdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CommitMessage, SavedRepository } from '../shared/git'
import type { MergedBranch } from '../shared/github'
import { MAX_TABS } from '../shared/tabs'
import { ClaudeError } from './claude'
import { createHandlers, type HandlerDeps } from './handlers'
import type { BranchMenuTarget } from './menu'
import { createMergedBranchCache } from './mergedBranchCache'
import { createRepositoryStore } from './repositoryStore'
import {
  addBareRemote,
  cleanupTestRepos,
  cloneRepo,
  createRepoWithCommit,
  makeTempDir
} from './git/test-repo'

afterAll(cleanupTestRepos)

/** Stand-ins for a user who dismisses every menu and dialog, and for background work. */
const dismissed = {
  showRepositoryMenu: async () => false,
  confirmRemoval: async () => false,
  showBranchMenu: async () => null,
  setActiveRepository: () => {},
  setTabCount: () => {},
  generator: {
    generate: async () => {
      throw new Error('generate was not expected in this test')
    },
    cancel: () => {}
  },
  showGenerateError: async () => {},
  openExternal: async () => {
    throw new Error('openExternal was not expected in this test')
  },
  mergedBranches: createMergedBranchCache({ find: async () => [], onChanged: () => {} })
}

/**
 * Main's real merged-branch cache over a GitHub that answers `find`, recording each lookup in
 * `asked` and each pushed "merged branches changed" event in `changed`.
 */
function mergedBranchesFrom(find: (root: string) => Promise<MergedBranch[] | null>) {
  const asked: string[] = []
  const changed: string[] = []
  const mergedBranches = createMergedBranchCache({
    find: (root) => {
      asked.push(root)
      return find(root)
    },
    onChanged: (root) => changed.push(root)
  })
  return { mergedBranches, asked, changed }
}

const mergedFeature: MergedBranch = {
  name: 'feature',
  pullRequest: {
    number: 7,
    title: 'Add a feature',
    url: 'https://github.com/octo/hello/pull/7',
    baseBranch: 'main',
    mergedAt: '2026-11-01T10:00:00Z',
    headOid: 'a'.repeat(40)
  }
}

let storeDir = ''
let storeCount = 0
beforeAll(async () => {
  storeDir = await makeTempDir()
})

/** Handlers whose folder picker "chooses" the given folder, or cancels when given null. */
function handlersChoosing(
  folder: string | null,
  overrides: Partial<HandlerDeps> = {}
): ReturnType<typeof createHandlers> {
  const filePath = join(storeDir, `repositories-${storeCount++}.json`)
  return createHandlers({
    pickFolder: async () => folder,
    store: createRepositoryStore({ filePath }),
    ...dismissed,
    ...overrides
  })
}

describe('openRepository', () => {
  it('returns null when the user cancels the picker', async () => {
    await expect(handlersChoosing(null).openRepository()).resolves.toBeNull()
  })

  it('returns the repository root', async () => {
    const repo = await createRepoWithCommit()

    await expect(handlersChoosing(repo.root).openRepository()).resolves.toBe(repo.root)
  })

  it('returns the root when the user picked a subfolder', async () => {
    const repo = await createRepoWithCommit()
    const sub = join(repo.root, 'a', 'b')
    await mkdir(sub, { recursive: true })

    await expect(handlersChoosing(sub).openRepository()).resolves.toBe(repo.root)
  })

  it('rejects a folder that is not a repository, and does not allow it', async () => {
    const dir = await makeTempDir()
    const handlers = handlersChoosing(dir)

    await expect(handlers.openRepository()).rejects.toMatchObject({ code: 'NOT_A_REPOSITORY' })
    await expect(handlers.getStatus(dir)).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
  })
})

describe('listMergedBranches', () => {
  it('serves an opened repository’s merged branches', async () => {
    const repo = await createRepoWithCommit()
    const { mergedBranches, asked } = mergedBranchesFrom(async () => [mergedFeature])
    const handlers = handlersChoosing(repo.root, { mergedBranches })
    await handlers.openRepository()

    await expect(handlers.listMergedBranches(repo.root)).resolves.toEqual([mergedFeature])
    expect(asked).toEqual([repo.root])
  })

  it('serves a re-read, as after Refresh, from what main kept, without asking GitHub again', async () => {
    const repo = await createRepoWithCommit()
    const { mergedBranches, asked } = mergedBranchesFrom(async () => [mergedFeature])
    const handlers = handlersChoosing(repo.root, { mergedBranches })
    await handlers.openRepository()
    await handlers.listMergedBranches(repo.root)

    await expect(handlers.listMergedBranches(repo.root)).resolves.toEqual([mergedFeature])
    expect(asked).toEqual([repo.root])
  })

  it('rejects a repository that was never opened, without asking GitHub', async () => {
    const repo = await createRepoWithCommit()
    const { mergedBranches, asked } = mergedBranchesFrom(async () => [mergedFeature])
    const handlers = handlersChoosing(null, { mergedBranches })

    await expect(handlers.listMergedBranches(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    expect(asked).toEqual([])
  })

  it('looks a repository up afresh once it has been removed and opened again', async () => {
    const repo = await createRepoWithCommit()
    const { mergedBranches, asked } = mergedBranchesFrom(async () => [mergedFeature])
    const handlers = handlersChoosing(repo.root, { mergedBranches })
    await handlers.openRepository()
    await handlers.listMergedBranches(repo.root)

    await handlers.removeRepository(repo.root)
    await handlers.openRepository()
    await handlers.listMergedBranches(repo.root)

    expect(asked).toEqual([repo.root, repo.root])
  })
})

/** An opened repository whose merged branches have been read, and the URLs it opened. */
async function openedWithMerged(merged: MergedBranch[] = [mergedFeature]) {
  const repo = await createRepoWithCommit()
  const browsed: string[] = []
  const { mergedBranches, asked } = mergedBranchesFrom(async () => merged)
  const handlers = handlersChoosing(repo.root, {
    mergedBranches,
    openExternal: async (url) => {
      browsed.push(url)
    }
  })
  await handlers.openRepository()
  return { repo, handlers, browsed, asked }
}

describe('openExternal', () => {
  it('opens a merged branch’s pull request in the browser', async () => {
    const { repo, handlers, browsed } = await openedWithMerged()
    await handlers.listMergedBranches(repo.root)

    await handlers.openExternal(repo.root, mergedFeature.pullRequest.url)

    expect(browsed).toEqual([mergedFeature.pullRequest.url])
  })

  it('rejects a URL that is not https, even one GitHub gave', async () => {
    const insecure = 'http://github.com/octo/hello/pull/7'
    const merged = {
      ...mergedFeature,
      pullRequest: { ...mergedFeature.pullRequest, url: insecure }
    }
    const { repo, handlers, browsed } = await openedWithMerged([merged])
    await handlers.listMergedBranches(repo.root)

    await expect(handlers.openExternal(repo.root, insecure)).rejects.toMatchObject({
      code: 'INVALID_URL'
    })
    expect(browsed).toEqual([])
  })

  it('rejects an https URL that no pull request has', async () => {
    const { repo, handlers, browsed } = await openedWithMerged()
    await handlers.listMergedBranches(repo.root)

    await expect(
      handlers.openExternal(repo.root, 'https://example.com/pull/7')
    ).rejects.toMatchObject({ code: 'INVALID_URL' })
    expect(browsed).toEqual([])
  })

  it('rejects a URL before anything is cached, without asking GitHub', async () => {
    const { repo, handlers, browsed, asked } = await openedWithMerged()

    await expect(
      handlers.openExternal(repo.root, mergedFeature.pullRequest.url)
    ).rejects.toMatchObject({ code: 'INVALID_URL' })
    expect(browsed).toEqual([])
    expect(asked).toEqual([])
  })

  it('rejects a repository that was never opened', async () => {
    const { repo, handlers, browsed } = await openedWithMerged()
    await handlers.listMergedBranches(repo.root)
    const other = await createRepoWithCommit()

    await expect(
      handlers.openExternal(other.root, mergedFeature.pullRequest.url)
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
    expect(browsed).toEqual([])
  })

  it('rejects a pull request cached for another repository', async () => {
    const merged = await createRepoWithCommit()
    const plain = await createRepoWithCommit()
    const folders = [merged.root, plain.root]
    const browsed: string[] = []
    const { mergedBranches } = mergedBranchesFrom(async (root) =>
      root === merged.root ? [mergedFeature] : []
    )
    const handlers = handlersChoosing(null, {
      pickFolder: async () => folders.shift() ?? null,
      mergedBranches,
      openExternal: async (url) => {
        browsed.push(url)
      }
    })
    await handlers.openRepository()
    await handlers.openRepository()
    await handlers.listMergedBranches(merged.root)
    await handlers.listMergedBranches(plain.root)

    await expect(
      handlers.openExternal(plain.root, mergedFeature.pullRequest.url)
    ).rejects.toMatchObject({ code: 'INVALID_URL' })
    expect(browsed).toEqual([])
  })
})

describe('getStatus and listBranches', () => {
  it('serve a repository that was opened this session', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    const status = await handlers.getStatus(repo.root)
    const branches = await handlers.listBranches(repo.root)

    expect(status.branch).toBe((await repo.git('branch', '--show-current')).trim())
    expect(branches.filter((branch) => branch.isCurrent)).toHaveLength(1)
  })

  it('reject a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(null)

    await expect(handlers.getStatus(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    await expect(handlers.listBranches(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it('require the root itself, not a subfolder of an opened repository', async () => {
    const repo = await createRepoWithCommit()
    const sub = join(repo.root, 'a')
    await mkdir(sub)
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.getStatus(sub)).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
  })

  it('require the exact root, so a trailing slash fails closed', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.getStatus(`${repo.root}/`)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it('do not share opened repositories between handler sets', async () => {
    const repo = await createRepoWithCommit()
    await handlersChoosing(repo.root).openRepository()

    await expect(handlersChoosing(null).getStatus(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

function handlersSharing(
  store: ReturnType<typeof createRepositoryStore>,
  folder: string | null,
  extra: Partial<HandlerDeps> = {}
) {
  return createHandlers({ pickFolder: async () => folder, store, ...dismissed, ...extra })
}
const newStore = (): ReturnType<typeof createRepositoryStore> =>
  createRepositoryStore({ filePath: join(storeDir, `shared-${storeCount++}.json`) })

describe('saved repositories', () => {
  it('lists an opened repository, and allows it again in a new session', async () => {
    const repo = await createRepoWithCommit()
    const store = newStore()
    await handlersSharing(store, repo.root).openRepository()

    const restarted = handlersSharing(store, null)

    expect((await restarted.listRepositories()).map((r) => r.root)).toEqual([repo.root])
    await expect(restarted.getStatus(repo.root)).resolves.toMatchObject({ detached: false })
  })

  it('does not trust a saved root that is no longer a repository', async () => {
    const repo = await createRepoWithCommit()
    const store = newStore()
    await handlersSharing(store, repo.root).openRepository()
    await rm(join(repo.root, '.git'), { recursive: true })

    await expect(handlersSharing(store, null).getStatus(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it('revokes access when a repository is removed', async () => {
    const repo = await createRepoWithCommit()
    const store = newStore()
    const handlers = handlersSharing(store, repo.root)
    await handlers.openRepository()

    await handlers.removeRepository(repo.root)

    expect(await handlers.listRepositories()).toEqual([])
    await expect(handlers.getStatus(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

describe('showRepositoryMenu', () => {
  it('shows the menu for the saved repository and removes it when the user chooses Remove', async () => {
    const repo = await createRepoWithCommit()
    const shown: SavedRepository[] = []
    const handlers = handlersSharing(newStore(), repo.root, {
      showRepositoryMenu: async (repository) => {
        shown.push(repository)
        return true
      }
    })
    await handlers.openRepository()

    await expect(handlers.showRepositoryMenu(repo.root)).resolves.toBe(true)

    expect(shown.map((r) => r.root)).toEqual([repo.root])
    expect(await handlers.listRepositories()).toEqual([])
    await expect(handlers.getStatus(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it('keeps the repository when the menu is dismissed', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersSharing(newStore(), repo.root)
    await handlers.openRepository()

    await expect(handlers.showRepositoryMenu(repo.root)).resolves.toBe(false)

    expect((await handlers.listRepositories()).map((r) => r.root)).toEqual([repo.root])
  })

  it('rejects a root that is not saved, without showing a menu', async () => {
    const repo = await createRepoWithCommit()
    let shown = false
    const handlers = handlersSharing(newStore(), null, {
      showRepositoryMenu: async () => {
        shown = true
        return true
      }
    })

    await expect(handlers.showRepositoryMenu(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    expect(shown).toBe(false)
  })
})

describe('confirmRemoveMissingRepository', () => {
  it('removes a saved repository whose folder is gone when the user confirms', async () => {
    const repo = await createRepoWithCommit()
    const store = newStore()
    await handlersSharing(store, repo.root).openRepository()
    await rm(repo.root, { recursive: true })
    const asked: SavedRepository[] = []
    const handlers = handlersSharing(store, null, {
      confirmRemoval: async (repository) => {
        asked.push(repository)
        return true
      }
    })

    await expect(handlers.confirmRemoveMissingRepository(repo.root)).resolves.toBe(true)

    expect(asked).toMatchObject([{ root: repo.root, missing: true }])
    expect(await handlers.listRepositories()).toEqual([])
  })

  it('keeps the repository when the user cancels', async () => {
    const repo = await createRepoWithCommit()
    const store = newStore()
    await handlersSharing(store, repo.root).openRepository()
    await rm(repo.root, { recursive: true })

    const handlers = handlersSharing(store, null)

    await expect(handlers.confirmRemoveMissingRepository(repo.root)).resolves.toBe(false)
    expect(await handlers.listRepositories()).toHaveLength(1)
  })

  it('rejects a root that is not saved', async () => {
    const handlers = handlersSharing(newStore(), null)

    await expect(handlers.confirmRemoveMissingRepository('/nowhere')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

describe('checkoutBranch', () => {
  it('switches the opened repository to another branch', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'work')
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await handlers.checkoutBranch(repo.root, 'work')

    expect((await repo.git('branch', '--show-current')).trim()).toBe('work')
  })

  it('rejects a repository that was never opened, and leaves it alone', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'work')

    await expect(handlersChoosing(null).checkoutBranch(repo.root, 'work')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    expect((await repo.git('branch', '--show-current')).trim()).toBe('main')
  })
})

async function opened(repo: { root: string }, extra: Partial<HandlerDeps>) {
  const filePath = join(storeDir, `repositories-${storeCount++}.json`)
  const handlers = createHandlers({
    pickFolder: async () => repo.root,
    store: createRepositoryStore({ filePath }),
    ...dismissed,
    ...extra
  })
  await handlers.openRepository()
  return handlers
}

describe('showBranchMenu', () => {
  it('offers the menu for a branch and returns what the user chose', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'work')
    const shown: BranchMenuTarget[] = []
    const handlers = await opened(repo, {
      showBranchMenu: async (branch) => {
        shown.push(branch)
        return 'checkout'
      }
    })

    await expect(handlers.showBranchMenu(repo.root, 'work')).resolves.toBe('checkout')
    expect(shown).toEqual([{ name: 'work', isCurrent: false, deletable: true }])
  })

  it('tells the menu when the branch is the current one', async () => {
    const repo = await createRepoWithCommit()
    const shown: BranchMenuTarget[] = []
    const handlers = await opened(repo, {
      showBranchMenu: async (branch) => {
        shown.push(branch)
        return null
      }
    })

    await expect(handlers.showBranchMenu(repo.root, 'main')).resolves.toBeNull()
    expect(shown).toEqual([{ name: 'main', isCurrent: true, deletable: false }])
  })

  it('tells the menu a branch checked out in another work tree cannot be deleted', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    await repo.git('worktree', 'add', '-q', join(await makeTempDir(), 'tree'), 'feature')
    const shown: BranchMenuTarget[] = []
    const handlers = await opened(repo, {
      showBranchMenu: async (branch) => {
        shown.push(branch)
        return null
      }
    })

    await handlers.showBranchMenu(repo.root, 'feature')

    expect(shown).toEqual([{ name: 'feature', isCurrent: false, deletable: false }])
  })

  it('rejects a repository that was never opened, without showing a menu', async () => {
    const repo = await createRepoWithCommit()
    let shown = false
    const guarded = createHandlers({
      pickFolder: async () => null,
      store: createRepositoryStore({
        filePath: join(storeDir, `repositories-${storeCount++}.json`)
      }),
      ...dismissed,
      showBranchMenu: async () => {
        shown = true
        return null
      }
    })

    await expect(guarded.showBranchMenu(repo.root, 'main')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    expect(shown).toBe(false)
  })
})

/** `feature` with one commit of its own, merged by a pull request whose head is `head`. */
async function mergedAt(head: 'tip' | 'parent' | 'child') {
  const repo = await createRepoWithCommit()
  await repo.git('checkout', '-q', '-b', 'feature')
  await repo.write('a.txt')
  await repo.commit('A')
  if (head === 'child') {
    await repo.write('b.txt')
    await repo.commit('B, a review fix the branch never pulled')
  }
  const headOid = (await repo.git('rev-parse', 'HEAD')).trim()
  if (head === 'child') await repo.git('reset', '-q', '--hard', 'HEAD~1')
  if (head === 'parent') {
    await repo.write('c.txt')
    await repo.commit('C, after the merge')
  }
  await repo.git('checkout', '-q', 'main')
  const merged: MergedBranch = {
    name: 'feature',
    pullRequest: { ...mergedFeature.pullRequest, headOid }
  }
  const { mergedBranches } = mergedBranchesFrom(async () => [merged])
  const handlers = await opened(repo, { mergedBranches })
  await handlers.listMergedBranches(repo.root)
  return { repo, handlers, merged }
}

describe('getBranchDeletion and deleteBranch', () => {
  it('reads what deleting a branch would lose, then deletes it', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'feature')
    await repo.write('a.txt')
    await repo.commit('A')
    await repo.git('checkout', '-q', 'main')
    const handlers = await opened(repo, {})

    const deletion = await handlers.getBranchDeletion(repo.root, 'feature')
    expect(deletion).toMatchObject({ name: 'feature', branchOnlyCommits: 1, goneUpstream: null })
    await handlers.deleteBranch(repo.root, 'feature', deletion.oid, null)

    expect((await repo.git('branch', '--list', 'feature')).trim()).toBe('')
  })

  it('drops a deleted merged branch from the merged result, and reports the change', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    const { mergedBranches, asked, changed } = mergedBranchesFrom(async () => [mergedFeature])
    const handlers = await opened(repo, { mergedBranches })
    await expect(handlers.listMergedBranches(repo.root)).resolves.toEqual([mergedFeature])

    const deletion = await handlers.getBranchDeletion(repo.root, 'feature')
    await handlers.deleteBranch(repo.root, 'feature', deletion.oid, null)

    expect(changed).toEqual([repo.root])
    await expect(handlers.listMergedBranches(repo.root)).resolves.toEqual([])
    expect(asked).toEqual([repo.root])
  })

  it('leaves the merged result alone when a delete fails', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    const { mergedBranches, changed } = mergedBranchesFrom(async () => [mergedFeature])
    const handlers = await opened(repo, { mergedBranches })
    await handlers.listMergedBranches(repo.root)
    const deletion = await handlers.getBranchDeletion(repo.root, 'feature')
    await repo.write('moved.txt')
    await repo.git('add', 'moved.txt')
    await repo.git('commit', '-q', '-m', 'Moved')
    await repo.git('branch', '-f', 'feature', 'HEAD')

    await expect(
      handlers.deleteBranch(repo.root, 'feature', deletion.oid, null)
    ).rejects.toMatchObject({ code: 'BRANCH_MOVED' })

    expect(changed).toEqual([])
    await expect(handlers.listMergedBranches(repo.root)).resolves.toEqual([mergedFeature])
  })

  describe('the pull request that merged the branch', () => {
    it('names it when its head is the tip read', async () => {
      const { repo, handlers, merged } = await mergedAt('tip')

      await expect(handlers.getBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
        branchOnlyCommits: 1,
        mergedBy: merged.pullRequest
      })
    })

    it('names it when its head contains the tip read', async () => {
      const { repo, handlers, merged } = await mergedAt('child')

      await expect(handlers.getBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
        mergedBy: merged.pullRequest
      })
    })

    it('doesn’t name it once the branch has a commit the pull request never carried', async () => {
      // Main's merged result is only looked up again after a fetch, so it still names the PR.
      const { repo, handlers } = await mergedAt('parent')

      await expect(handlers.getBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
        branchOnlyCommits: 2,
        mergedBy: null
      })
    })

    it('names none for a branch no pull request merged', async () => {
      const repo = await createRepoWithCommit()
      await repo.git('branch', 'feature')
      const handlers = await opened(repo, {})

      await expect(handlers.getBranchDeletion(repo.root, 'feature')).resolves.toMatchObject({
        mergedBy: null
      })
    })
  })

  it('refuses a branch that does not exist', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await opened(repo, {})

    await expect(handlers.getBranchDeletion(repo.root, '--all')).rejects.toMatchObject({
      code: 'INVALID_REF'
    })
  })

  it('refuses to delete the current or default branch', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'work')
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()
    const handlers = await opened(repo, {})

    for (const name of ['work', 'main']) {
      await expect(handlers.deleteBranch(repo.root, name, oid, null)).rejects.toMatchObject({
        code: 'INVALID_REF'
      })
    }
    expect((await repo.git('branch', '--list', 'main')).trim()).not.toBe('')
  })

  it('refuses an oid that is not a full object id', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    const oid = (await repo.git('rev-parse', 'feature')).trim()
    const handlers = await opened(repo, {})

    await expect(handlers.deleteBranch(repo.root, 'feature', 'HEAD', null)).rejects.toMatchObject({
      code: 'INVALID_REF'
    })
    await expect(
      handlers.deleteBranch(repo.root, 'feature', oid, '--mirror')
    ).rejects.toMatchObject({ code: 'INVALID_REF' })
  })

  it('deletes the upstream too when asked, and refuses one it may not offer', async () => {
    const repo = await createRepoWithCommit()
    const origin = await addBareRemote(repo)
    await repo.git('checkout', '-q', '-b', 'foo')
    await repo.git('push', '-q', '-u', 'origin', 'foo:bar')
    await repo.git('branch', 'local-only')
    await repo.git('checkout', '-q', 'main')
    const handlers = await opened(repo, {})

    const local = await handlers.getBranchDeletion(repo.root, 'local-only')
    await expect(
      handlers.deleteBranch(repo.root, 'local-only', local.oid, local.oid)
    ).rejects.toMatchObject({ code: 'BRANCH_MOVED' })
    expect((await repo.git('branch', '--list', 'local-only')).trim()).not.toBe('')

    const deletion = await handlers.getBranchDeletion(repo.root, 'foo')
    expect(deletion.deletableUpstream).toMatchObject({ name: 'origin/bar', remote: 'origin' })
    await handlers.deleteBranch(
      repo.root,
      'foo',
      deletion.oid,
      deletion.deletableUpstream?.oid ?? null
    )

    expect((await origin.git('branch', '--list', 'bar')).trim()).toBe('')
    expect((await repo.git('branch', '--list', 'foo')).trim()).toBe('')
  })

  it('rejects a repository that was never opened, and leaves it alone', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature')
    const oid = (await repo.git('rev-parse', 'feature')).trim()

    await expect(
      handlersChoosing(null).deleteBranch(repo.root, 'feature', oid, null)
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
    expect((await repo.git('branch', '--list', 'feature')).trim()).not.toBe('')
  })
})

async function openedRepo() {
  const repo = await createRepoWithCommit()
  await repo.write('README.md', 'changed\n')
  const handlers = handlersChoosing(repo.root)
  await handlers.openRepository()
  return { repo, handlers }
}

describe('getDiff', () => {
  it('returns the diff of a file in an opened repository', async () => {
    const { repo, handlers } = await openedRepo()

    const diff = await handlers.getDiff(repo.root, 'README.md', null)

    expect(diff.staged).toBeNull()
    expect(diff.unstaged).toMatchObject({ binary: false })
  })

  it('rejects a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(
      handlersChoosing(null).getDiff(repo.root, 'README.md', null)
    ).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it.each(['../outside.txt', '/etc/passwd', 'a/../../b', ''])(
    'rejects the path %j before it reaches git',
    async (path) => {
      const { repo, handlers } = await openedRepo()

      await expect(handlers.getDiff(repo.root, path, null)).rejects.toMatchObject({
        code: 'INVALID_PATH'
      })
    }
  )

  it('rejects a path through a folder that is symlinked outside the repository', async () => {
    const { repo, handlers } = await openedRepo()
    await symlink(await makeTempDir(), join(repo.root, 'escape'))

    await expect(handlers.getDiff(repo.root, 'escape/secret.txt', null)).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
  })

  it('rejects an original path that points outside the repository', async () => {
    const { repo, handlers } = await openedRepo()

    await expect(handlers.getDiff(repo.root, 'README.md', '../old.txt')).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
  })
})

describe('stageFiles and unstageFiles', () => {
  it('stages and unstages changes in an opened repository', async () => {
    const { handlers, repo } = await openedRepo()

    await handlers.stageFiles(repo.root, ['README.md'])
    expect((await handlers.getStatus(repo.root)).changes).toEqual([
      expect.objectContaining({ path: 'README.md', index: 'modified', worktree: 'unmodified' })
    ])

    await handlers.unstageFiles(repo.root, ['README.md'])
    expect((await handlers.getStatus(repo.root)).changes).toEqual([
      expect.objectContaining({ path: 'README.md', index: 'unmodified', worktree: 'modified' })
    ])
  })

  it('rejects a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(null)

    await expect(handlers.stageFiles(repo.root, ['README.md'])).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    await expect(handlers.unstageFiles(repo.root, ['README.md'])).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it.each(['../outside.txt', '/etc/passwd', 'a/../../b', ''])(
    'rejects the path %j before it reaches git',
    async (path) => {
      const { repo, handlers } = await openedRepo()

      await expect(handlers.stageFiles(repo.root, [path])).rejects.toMatchObject({
        code: 'INVALID_PATH'
      })
      await expect(handlers.unstageFiles(repo.root, [path])).rejects.toMatchObject({
        code: 'INVALID_PATH'
      })
    }
  )

  it('rejects the whole batch when one path is bad, staging nothing', async () => {
    const { repo, handlers } = await openedRepo()
    await repo.write('good.txt')

    await expect(
      handlers.stageFiles(repo.root, ['good.txt', '../outside.txt'])
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    const changes = await handlers.getStatus(repo.root)
    expect(changes.changes).toContainEqual(
      expect.objectContaining({ path: 'good.txt', kind: 'untracked' })
    )
  })
})

describe('commit', () => {
  it('commits what is staged in an opened repository', async () => {
    const { repo, handlers } = await openedRepo()
    await handlers.stageFiles(repo.root, ['README.md'])

    await handlers.commit(repo.root, 'Change the README')

    expect((await handlers.getStatus(repo.root)).changes).toEqual([])
    expect(await repo.git('log', '-1', '--format=%s')).toBe('Change the README\n')
  })

  it('rejects a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(null)

    await expect(handlers.commit(repo.root, 'Nope')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it('surfaces git refusing an empty index', async () => {
    const { repo, handlers } = await openedRepo()

    await expect(handlers.commit(repo.root, 'Nothing staged')).rejects.toMatchObject({
      code: 'COMMAND_FAILED'
    })
  })
})

/** Handlers that record what they are told the active repository is. */
function handlersRecordingActive(folder: string | null) {
  const active: (string | null)[] = []
  const filePath = join(storeDir, `repositories-${storeCount++}.json`)
  const handlers = createHandlers({
    pickFolder: async () => folder,
    store: createRepositoryStore({ filePath }),
    ...dismissed,
    setActiveRepository: (root) => active.push(root)
  })
  return { handlers, active }
}

describe('setActiveRepository', () => {
  it('passes on a repository the user opened', async () => {
    const repo = await createRepoWithCommit()
    const { handlers, active } = handlersRecordingActive(repo.root)
    await handlers.openRepository()

    await handlers.setActiveRepository(repo.root)

    expect(active).toEqual([repo.root])
  })

  it('passes on null without checking anything, so background work can always be stopped', async () => {
    const { handlers, active } = handlersRecordingActive(null)

    await handlers.setActiveRepository(null)

    expect(active).toEqual([null])
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()
    const { handlers, active } = handlersRecordingActive(null)

    await expect(handlers.setActiveRepository(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    expect(active).toEqual([])
  })
})

describe('recheckMergedBranches', () => {
  it('asks GitHub again and resolves once the new answer is served', async () => {
    const repo = await createRepoWithCommit()
    let answer: MergedBranch[] = []
    const { mergedBranches, asked, changed } = mergedBranchesFrom(async () => answer)
    const handlers = handlersChoosing(repo.root, { mergedBranches })
    await handlers.openRepository()
    await expect(handlers.listMergedBranches(repo.root)).resolves.toEqual([])

    answer = [mergedFeature]
    await handlers.recheckMergedBranches(repo.root)

    expect(asked).toEqual([repo.root, repo.root])
    expect(changed).toEqual([repo.root])
    await expect(handlers.listMergedBranches(repo.root)).resolves.toEqual([mergedFeature])
  })

  it('refuses a repository that was never opened, without asking GitHub', async () => {
    const repo = await createRepoWithCommit()
    const { mergedBranches, asked } = mergedBranchesFrom(async () => [])
    const handlers = handlersChoosing(null, { mergedBranches })

    await expect(handlers.recheckMergedBranches(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
    expect(asked).toEqual([])
  })
})

describe('fetchRepository', () => {
  it('updates the remote-tracking refs, so the branch reports behind by one', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    const handlers = handlersChoosing(clone.root)
    await handlers.openRepository()
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')

    await handlers.fetchRepository(clone.root)

    const main = (await handlers.listBranches(clone.root)).find((b) => b.name === 'main')
    expect(main?.behind).toBe(1)
  })

  it('looks the merged branches up again afterwards, and reports a change', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    let answer: MergedBranch[] = []
    const { mergedBranches, asked, changed } = mergedBranchesFrom(async () => answer)
    const handlers = handlersChoosing(clone.root, { mergedBranches })
    await handlers.openRepository()
    await expect(handlers.listMergedBranches(clone.root)).resolves.toEqual([])

    answer = [mergedFeature]
    await handlers.fetchRepository(clone.root)

    await vi.waitFor(() => expect(changed).toEqual([clone.root]))
    expect(asked).toEqual([clone.root, clone.root])
    await expect(handlers.listMergedBranches(clone.root)).resolves.toEqual([mergedFeature])
  })

  it('fails rather than staying quiet when the remote cannot be reached', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('remote', 'add', 'origin', '/nowhere/there-is-no-repository-here')
    const { mergedBranches, asked } = mergedBranchesFrom(async () => [])
    const handlers = handlersChoosing(repo.root, { mergedBranches })
    await handlers.openRepository()

    await expect(handlers.fetchRepository(repo.root)).rejects.toMatchObject({
      code: 'COMMAND_FAILED'
    })
    expect(asked).toEqual([])
  })

  it('says so when the repository has no remote, rather than reporting a fetch that did nothing', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.fetchRepository(repo.root)).rejects.toMatchObject({
      code: 'NO_REMOTE'
    })
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(handlersChoosing(null).fetchRepository(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

describe('pullRepository', () => {
  it('fast-forwards the current branch onto its upstream', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    const handlers = handlersChoosing(clone.root)
    await handlers.openRepository()
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')

    await handlers.pullRepository(clone.root)

    const status = await handlers.getStatus(clone.root)
    expect(status.behind).toBe(0)
    expect(status.ahead).toBe(0)
  })

  it('says so when the repository has no remote', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.pullRepository(repo.root)).rejects.toMatchObject({
      code: 'NO_REMOTE'
    })
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(handlersChoosing(null).pullRepository(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })

  it('reports a diverged branch as PULL_NOT_FAST_FORWARD', async () => {
    const origin = await createRepoWithCommit()
    const clone = await cloneRepo(origin)
    const handlers = handlersChoosing(clone.root)
    await handlers.openRepository()
    await origin.write('upstream.txt')
    await origin.commit('Upstream commit')
    await clone.write('local.txt')
    await clone.commit('Local commit')

    await expect(handlers.pullRepository(clone.root)).rejects.toMatchObject({
      code: 'PULL_NOT_FAST_FORWARD'
    })
  })
})

describe('pushRepository', () => {
  it('sends the current branch to its upstream', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()
    await repo.write('local.txt')
    await repo.commit('Local commit')

    await handlers.pushRepository(repo.root)

    expect((await remote.git('rev-parse', 'main')).trim()).toBe(
      (await repo.git('rev-parse', 'HEAD')).trim()
    )
  })

  it('says so when the repository has no remote', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.pushRepository(repo.root)).rejects.toMatchObject({
      code: 'NO_REMOTE',
      message: expect.stringMatching(/no remote/)
    })
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(handlersChoosing(null).pushRepository(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

describe('publishBranch', () => {
  it('creates the current branch on the chosen remote', async () => {
    const repo = await createRepoWithCommit()
    const remote = await addBareRemote(repo)
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()
    await repo.git('checkout', '-q', '-b', 'feature')

    await handlers.publishBranch(repo.root, 'origin')

    expect(await remote.git('for-each-ref', '--format=%(refname)', 'refs/heads/feature')).toBe(
      'refs/heads/feature\n'
    )
  })

  it('refuses a remote the repository does not have, before it reaches git', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.publishBranch(repo.root, '--mirror')).rejects.toMatchObject({
      code: 'INVALID_REF'
    })
  })

  it('says so when the repository has no remote', async () => {
    const repo = await createRepoWithCommit()
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.publishBranch(repo.root, 'origin')).rejects.toMatchObject({
      code: 'NO_REMOTE'
    })
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(handlersChoosing(null).publishBranch(repo.root, 'origin')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

describe('getPublishTarget', () => {
  it('describes where the current branch can go', async () => {
    const repo = await createRepoWithCommit()
    await addBareRemote(repo)
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    const target = await handlers.getPublishTarget(repo.root)

    expect(target).toMatchObject({ branch: 'main', remotes: [{ name: 'origin', hasBranch: true }] })
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(handlersChoosing(null).getPublishTarget(repo.root)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

/** Handlers recording the tab counts main was told to rebuild the menu for. */
function handlersRecordingTabCount(): {
  handlers: ReturnType<typeof createHandlers>
  counts: number[]
} {
  const counts: number[] = []
  const filePath = join(storeDir, `repositories-${storeCount++}.json`)
  return {
    handlers: createHandlers({
      pickFolder: async () => null,
      store: createRepositoryStore({ filePath }),
      ...dismissed,
      setTabCount: (count) => counts.push(count)
    }),
    counts
  }
}

describe('setTabCount', () => {
  it('passes on a count the strip could really have, including an empty strip', async () => {
    const { handlers, counts } = handlersRecordingTabCount()

    await handlers.setTabCount(0)
    await handlers.setTabCount(MAX_TABS)

    expect(counts).toEqual([0, MAX_TABS])
  })

  it('refuses a count no strip can hold, rather than building a menu around it', async () => {
    const { handlers, counts } = handlersRecordingTabCount()

    for (const count of [-1, MAX_TABS + 1, 1.5, Number.NaN]) {
      await expect(handlers.setTabCount(count)).rejects.toMatchObject({
        code: 'INVALID_TAB_COUNT'
      })
    }
    expect(counts).toEqual([])
  })
})

/** Handlers with `repo` already opened, as the renderer would have done. */
async function handlersFor(root: string): Promise<ReturnType<typeof createHandlers>> {
  const handlers = handlersChoosing(root)
  await handlers.openRepository()
  return handlers
}

describe('listCommits', () => {
  it('lists a branch the user picked', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)

    const commits = await handlers.listCommits(repo.root, 'main', 10, 0)
    expect(commits.map((commit) => commit.subject)).toEqual(['Initial commit'])
  })

  it('accepts a full oid, which is how later pages are anchored', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    await expect(handlers.listCommits(repo.root, oid, 10, 0)).resolves.toHaveLength(1)
  })

  it('refuses a ref that is neither a branch nor an oid', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)

    for (const ref of ['HEAD', '--output=/tmp/x', 'main; rm -rf /', 'origin/main', 'nope']) {
      await expect(handlers.listCommits(repo.root, ref, 10, 0)).rejects.toMatchObject({
        code: 'INVALID_REF'
      })
    }
  })

  it('refuses paging numbers that are not whole and positive', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)

    await expect(handlers.listCommits(repo.root, 'main', -1, 0)).rejects.toMatchObject({
      code: 'INVALID_REF'
    })
    await expect(handlers.listCommits(repo.root, 'main', 1.5, 0)).rejects.toMatchObject({
      code: 'INVALID_REF'
    })
    await expect(handlers.listCommits(repo.root, 'main', 10, Number.NaN)).rejects.toMatchObject({
      code: 'INVALID_REF'
    })
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(
      handlersChoosing(null).listCommits(repo.root, 'main', 10, 0)
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
  })
})

/** A pushed `feature`, squash-merged on the remote and its remote branch deleted. */
async function squashMergedFeature() {
  const source = await createRepoWithCommit()
  const clone = await cloneRepo(source)
  await clone.git('checkout', '-q', '-b', 'feature')
  await clone.write('feature.txt')
  await clone.commit('Feature')
  await clone.git('push', '-q', '-u', 'origin', 'feature')
  await source.git('merge', '-q', '--squash', 'feature')
  await source.commit('Feature (#7)')
  await source.git('branch', '-q', '-D', 'feature')
  await clone.git('fetch', '-q', '--prune')
  const head = (await clone.git('rev-parse', 'feature')).trim()
  return {
    clone,
    merged: { name: 'feature', pullRequest: { ...mergedFeature.pullRequest, headOid: head } }
  }
}

describe('listUnpushedCommits', () => {
  it('lists the unpushed commits of a branch the user picked', async () => {
    const clone = await cloneRepo(await createRepoWithCommit())
    await clone.write('a.txt')
    await clone.commit('A')
    const handlers = await handlersFor(clone.root)
    const head = (await clone.git('rev-parse', 'HEAD')).trim()

    await expect(handlers.listUnpushedCommits(clone.root, 'main')).resolves.toEqual([head])
  })

  it('leaves out the commits the pull request that merged the branch carried', async () => {
    const { clone, merged } = await squashMergedFeature()
    const { mergedBranches } = mergedBranchesFrom(async () => [merged])
    const handlers = handlersChoosing(clone.root, { mergedBranches })
    await handlers.openRepository()
    await handlers.listMergedBranches(clone.root)

    await expect(handlers.listUnpushedCommits(clone.root, 'feature')).resolves.toEqual([])
  })

  it('never asks GitHub, judging by the merged branches main already has', async () => {
    const { clone, merged } = await squashMergedFeature()
    const { mergedBranches, asked } = mergedBranchesFrom(async () => [merged])
    const handlers = handlersChoosing(clone.root, { mergedBranches })
    await handlers.openRepository()

    await expect(handlers.listUnpushedCommits(clone.root, 'feature')).resolves.toHaveLength(1)
    expect(asked).toEqual([])
  })

  it('refuses a ref that is neither a branch nor an oid', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)

    for (const ref of ['HEAD', '--output=/tmp/x', 'origin/main', 'nope']) {
      await expect(handlers.listUnpushedCommits(repo.root, ref)).rejects.toMatchObject({
        code: 'INVALID_REF'
      })
    }
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()

    await expect(
      handlersChoosing(null).listUnpushedCommits(repo.root, 'main')
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
  })
})

describe('getCommitDetails', () => {
  it('describes a commit by its full oid', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    await expect(handlers.getCommitDetails(repo.root, oid)).resolves.toMatchObject({
      oid,
      authorName: 'Test'
    })
  })

  it('refuses anything but a full oid, before it reaches git', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    for (const ref of ['main', 'HEAD', oid.slice(0, 8), `${oid}x`, '--output=/tmp/x', '']) {
      await expect(handlers.getCommitDetails(repo.root, ref)).rejects.toMatchObject({
        code: 'INVALID_REF'
      })
    }
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    await expect(handlersChoosing(null).getCommitDetails(repo.root, oid)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

describe('listCommitFiles', () => {
  it('lists the files a commit changed, by its full oid', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    await expect(handlers.listCommitFiles(repo.root, oid)).resolves.toEqual([
      { kind: 'added', path: 'README.md', originalPath: null }
    ])
  })

  it('refuses anything but a full oid, before it reaches git', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)

    for (const ref of ['main', 'HEAD', '--output=/tmp/x', '']) {
      await expect(handlers.listCommitFiles(repo.root, ref)).rejects.toMatchObject({
        code: 'INVALID_REF'
      })
    }
  })

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    await expect(handlersChoosing(null).listCommitFiles(repo.root, oid)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_OPEN'
    })
  })
})

describe('getCommitFileDiff', () => {
  it('diffs one file of a commit', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    await expect(
      handlers.getCommitFileDiff(repo.root, oid, 'README.md', null)
    ).resolves.toMatchObject({ binary: false, truncated: false })
  })

  it('refuses anything but a full oid, before it reaches git', async () => {
    const repo = await createRepoWithCommit()
    const handlers = await handlersFor(repo.root)

    await expect(
      handlers.getCommitFileDiff(repo.root, 'HEAD', 'README.md', null)
    ).rejects.toMatchObject({ code: 'INVALID_REF' })
  })

  it.each(['../outside.txt', '/etc/passwd', 'a/../../b', ''])(
    'refuses the path %j, or that original path, before it reaches git',
    async (path) => {
      const repo = await createRepoWithCommit()
      const handlers = await handlersFor(repo.root)
      const oid = (await repo.git('rev-parse', 'HEAD')).trim()

      await expect(handlers.getCommitFileDiff(repo.root, oid, path, null)).rejects.toMatchObject({
        code: 'INVALID_PATH'
      })
      await expect(
        handlers.getCommitFileDiff(repo.root, oid, 'README.md', path)
      ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    }
  )

  it('refuses a repository that was never opened', async () => {
    const repo = await createRepoWithCommit()
    const oid = (await repo.git('rev-parse', 'HEAD')).trim()

    await expect(
      handlersChoosing(null).getCommitFileDiff(repo.root, oid, 'README.md', null)
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
  })
})

/** A generator that answers with `answer`, or fails with it, and records what it was asked. */
function fakeGenerator(answer: CommitMessage | ClaudeError) {
  const calls: { root: string; draft: CommitMessage }[] = []
  const cancelled: string[] = []
  return {
    calls,
    cancelled,
    generate: async (root: string, draft: CommitMessage) => {
      calls.push({ root, draft })
      if (answer instanceof ClaudeError) throw answer
      return answer
    },
    cancel: (root: string) => {
      cancelled.push(root)
    }
  }
}

async function openWith(overrides: Partial<HandlerDeps>) {
  const repo = await createRepoWithCommit()
  const handlers = handlersChoosing(repo.root, overrides)
  await handlers.openRepository()
  return { repo, handlers }
}

describe('generateCommitMessage and cancelGenerate', () => {
  const DRAFT = { subject: 'typed so far', description: '' }

  it('writes a message for an open repository, with the draft as guidance', async () => {
    const generator = fakeGenerator({ subject: 'Add a thing', description: 'Because.' })
    const { repo, handlers } = await openWith({ generator })

    await expect(handlers.generateCommitMessage(repo.root, DRAFT)).resolves.toEqual({
      subject: 'Add a thing',
      description: 'Because.'
    })
    expect(generator.calls).toEqual([{ root: repo.root, draft: DRAFT }])
  })

  it('refuses a repository that was not opened, before running anything', async () => {
    const repo = await createRepoWithCommit()
    const generator = fakeGenerator({ subject: 'S', description: '' })

    await expect(
      handlersChoosing(null, { generator }).generateCommitMessage(repo.root, DRAFT)
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_OPEN' })
    expect(generator.calls).toEqual([])
  })

  it('refuses a draft that is not a subject and a description', async () => {
    const generator = fakeGenerator({ subject: 'S', description: '' })
    const { repo, handlers } = await openWith({ generator })
    const notADraft = { subject: 42 } as unknown as CommitMessage

    await expect(handlers.generateCommitMessage(repo.root, notADraft)).rejects.toMatchObject({
      code: 'INVALID_DRAFT'
    })
    expect(generator.calls).toEqual([])
  })

  it('shows a failure in the error sheet, then still fails with its code', async () => {
    const shown: string[] = []
    const { repo, handlers } = await openWith({
      generator: fakeGenerator(new ClaudeError('CLAUDE_NOT_FOUND', 'Claude Code isn’t installed.')),
      showGenerateError: async (message) => {
        shown.push(message)
      }
    })

    await expect(handlers.generateCommitMessage(repo.root, DRAFT)).rejects.toMatchObject({
      code: 'CLAUDE_NOT_FOUND'
    })
    expect(shown).toEqual(['Claude Code isn’t installed.'])
  })

  it('shows no sheet when the user stopped it', async () => {
    const shown: string[] = []
    const { repo, handlers } = await openWith({
      generator: fakeGenerator(new ClaudeError('GENERATE_CANCELLED', 'Generate was stopped.')),
      showGenerateError: async (message) => {
        shown.push(message)
      }
    })

    await expect(handlers.generateCommitMessage(repo.root, DRAFT)).rejects.toMatchObject({
      code: 'GENERATE_CANCELLED'
    })
    expect(shown).toEqual([])
  })

  it('stops a repository’s run when it is removed from the list', async () => {
    const generator = fakeGenerator({ subject: 'S', description: '' })
    const { repo, handlers } = await openWith({ generator })

    await handlers.removeRepository(repo.root)

    expect(generator.cancelled).toEqual([repo.root])
  })

  it('fails without waiting for the error sheet to be dismissed', async () => {
    const { repo, handlers } = await openWith({
      generator: fakeGenerator(new ClaudeError('CLAUDE_FAILED', 'Claude Code couldn’t…')),
      showGenerateError: () => new Promise(() => {})
    })

    await expect(handlers.generateCommitMessage(repo.root, DRAFT)).rejects.toMatchObject({
      code: 'CLAUDE_FAILED'
    })
  })

  it('stops an open repository’s run', async () => {
    const generator = fakeGenerator({ subject: 'S', description: '' })
    const { repo, handlers } = await openWith({ generator })

    await handlers.cancelGenerate(repo.root)

    expect(generator.cancelled).toEqual([repo.root])
  })
})

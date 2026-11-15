import { mkdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SavedRepository } from '../shared/git'
import { createHandlers, type HandlerDeps } from './handlers'
import { createRepositoryStore } from './repositoryStore'
import { cleanupTestRepos, createRepoWithCommit, makeTempDir } from './git/test-repo'

afterAll(cleanupTestRepos)

/** Menu and dialog stand-ins for a user who dismisses everything. */
const dismissed = {
  showRepositoryMenu: async () => false,
  confirmRemoval: async () => false,
  showBranchMenu: async () => null
}

let storeDir = ''
let storeCount = 0
beforeAll(async () => {
  storeDir = await makeTempDir()
})

/** Handlers whose folder picker "chooses" the given folder, or cancels when given null. */
function handlersChoosing(folder: string | null): ReturnType<typeof createHandlers> {
  const filePath = join(storeDir, `repositories-${storeCount++}.json`)
  return createHandlers({
    pickFolder: async () => folder,
    store: createRepositoryStore({ filePath }),
    ...dismissed
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
    const shown: { name: string; isCurrent: boolean }[] = []
    const handlers = await opened(repo, {
      showBranchMenu: async (branch) => {
        shown.push(branch)
        return 'checkout'
      }
    })

    await expect(handlers.showBranchMenu(repo.root, 'work')).resolves.toBe('checkout')
    expect(shown).toEqual([{ name: 'work', isCurrent: false }])
  })

  it('tells the menu when the branch is the current one', async () => {
    const repo = await createRepoWithCommit()
    const shown: { name: string; isCurrent: boolean }[] = []
    const handlers = await opened(repo, {
      showBranchMenu: async (branch) => {
        shown.push(branch)
        return null
      }
    })

    await expect(handlers.showBranchMenu(repo.root, 'main')).resolves.toBeNull()
    expect(shown).toEqual([{ name: 'main', isCurrent: true }])
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

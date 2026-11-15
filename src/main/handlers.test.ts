import { mkdir, rm } from 'node:fs/promises'
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
  confirmRemoval: async () => false
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

import { mkdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SavedRepository } from '../shared/git'
import { MAX_TABS } from '../shared/tabs'
import { createHandlers, type HandlerDeps } from './handlers'
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
  setTabCount: () => {}
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

  it('fails rather than staying quiet when the remote cannot be reached', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('remote', 'add', 'origin', '/nowhere/there-is-no-repository-here')
    const handlers = handlersChoosing(repo.root)
    await handlers.openRepository()

    await expect(handlers.fetchRepository(repo.root)).rejects.toMatchObject({
      code: 'COMMAND_FAILED'
    })
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

describe('listCommits', () => {
  /** Handlers with `repo` already opened, as the renderer would have done. */
  async function handlersFor(root: string): Promise<ReturnType<typeof createHandlers>> {
    const handlers = handlersChoosing(root)
    await handlers.openRepository()
    return handlers
  }

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

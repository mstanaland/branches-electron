import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createRepositoryStore } from './repositoryStore'
import { cleanupTestRepos, createRepo, makeTempDir } from './git/test-repo'

afterAll(cleanupTestRepos)

async function newStore(now = () => new Date('2026-01-01T00:00:00.000Z')) {
  const dir = await makeTempDir()
  const filePath = join(dir, 'repositories.json')
  return { dir, filePath, store: createRepositoryStore({ filePath, now }) }
}

describe('add and list', () => {
  it('starts empty when no file exists', async () => {
    const { store } = await newStore()

    await expect(store.list()).resolves.toEqual([])
  })

  it('saves a repository named after its folder', async () => {
    const { store } = await newStore()
    const repo = await createRepo()

    await store.add(repo.root)

    const saved = await store.list()
    expect(saved).toEqual([
      {
        root: repo.root,
        name: repo.root.split('/').pop(),
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
        missing: false
      }
    ])
  })

  it('persists across store instances', async () => {
    const { store, filePath } = await newStore()
    const repo = await createRepo()
    await store.add(repo.root)

    const reopened = createRepositoryStore({ filePath })

    expect((await reopened.list()).map((r) => r.root)).toEqual([repo.root])
  })

  it('updates one entry per root, keeping its name', async () => {
    let time = new Date('2026-01-01T00:00:00.000Z')
    const { store } = await newStore(() => time)
    const repo = await createRepo()
    await store.add(repo.root)
    time = new Date('2026-02-02T00:00:00.000Z')

    await store.add(repo.root)

    const saved = await store.list()
    expect(saved).toHaveLength(1)
    expect(saved[0].lastOpenedAt).toBe('2026-02-02T00:00:00.000Z')
  })

  it('serializes concurrent adds without losing any', async () => {
    const { store } = await newStore()
    const repos = await Promise.all([createRepo(), createRepo(), createRepo()])

    await Promise.all(repos.map((repo) => store.add(repo.root)))

    expect((await store.list()).map((r) => r.root).toSorted()).toEqual(
      repos.map((r) => r.root).toSorted()
    )
  })
})

describe('remove', () => {
  it('removes the entry and leaves others', async () => {
    const { store } = await newStore()
    const [a, b] = await Promise.all([createRepo(), createRepo()])
    await store.add(a.root)
    await store.add(b.root)

    await store.remove(a.root)

    expect((await store.list()).map((r) => r.root)).toEqual([b.root])
  })

  it('ignores a root that is not saved', async () => {
    const { store } = await newStore()

    await expect(store.remove('/nope')).resolves.toBeUndefined()
  })
})

describe('has', () => {
  it('is true only for saved roots', async () => {
    const { store } = await newStore()
    const repo = await createRepo()
    await store.add(repo.root)

    await expect(store.has(repo.root)).resolves.toBe(true)
    await expect(store.has(`${repo.root}/`)).resolves.toBe(false)
  })
})

describe('missing detection', () => {
  it('flags a deleted folder on every read, and keeps the entry', async () => {
    const { store, dir } = await newStore()
    const repo = await createRepo()
    await store.add(repo.root)
    const moved = join(dir, 'moved')
    await rename(repo.root, moved)

    expect((await store.list())[0]).toMatchObject({ root: repo.root, missing: true })

    await rename(moved, repo.root)
    expect((await store.list())[0]).toMatchObject({ missing: false })
  })

  it('flags a folder that is no longer a repository', async () => {
    const { store } = await newStore()
    const repo = await createRepo()
    await store.add(repo.root)
    await rename(join(repo.root, '.git'), join(repo.root, 'git-gone'))

    expect((await store.list())[0]).toMatchObject({ missing: true })
  })

  it('flags a root that has become a subfolder of another repository', async () => {
    const { store, filePath } = await newStore()
    const outer = await createRepo()
    const inner = join(outer.root, 'inner')
    await mkdir(inner)
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        repositories: [{ root: inner, name: 'inner', lastOpenedAt: '2026-01-01T00:00:00.000Z' }]
      })
    )

    expect((await store.list())[0]).toMatchObject({ missing: true })
  })
})

describe('file handling', () => {
  it.each([
    ['not JSON', '{nope'],
    ['wrong shape', JSON.stringify({ version: 1, repositories: [{ root: 5 }] })],
    ['wrong version', JSON.stringify({ version: 99, repositories: [] })]
  ])('starts empty from a corrupt file (%s) and can save again', async (_label, contents) => {
    const { store, filePath } = await newStore()
    await writeFile(filePath, contents)
    const repo = await createRepo()

    await expect(store.list()).resolves.toEqual([])
    await store.add(repo.root)

    expect((await store.list()).map((r) => r.root)).toEqual([repo.root])
  })

  it('writes atomically, leaving no temp files and valid JSON', async () => {
    const { store, dir, filePath } = await newStore()
    const repo = await createRepo()

    await store.add(repo.root)

    expect(await readdir(dir)).toEqual(['repositories.json'])
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ version: 1 })
  })

  it('creates the folder for the file if needed', async () => {
    const dir = await makeTempDir()
    const store = createRepositoryStore({ filePath: join(dir, 'nested', 'repositories.json') })
    const repo = await createRepo()

    await store.add(repo.root)

    expect(await store.list()).toHaveLength(1)
  })
})

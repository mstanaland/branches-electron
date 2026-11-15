import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import type { SavedRepository } from '../shared/git'
import { isRepositoryRoot } from './git'

/** What is written to disk. `missing` is derived on every read, never stored. */
type StoredRepository = Omit<SavedRepository, 'missing'>

const FILE_VERSION = 1

export interface RepositoryStoreOptions {
  /** The JSON file, e.g. `<userData>/repositories.json`. */
  filePath: string
  /** Clock, injectable for tests. */
  now?: () => Date
}

export interface RepositoryStore {
  /** Adds the repository, or refreshes `lastOpenedAt` if its root is already saved. */
  add: (root: string) => Promise<void>
  /** Removes the saved repository. Not an error if it isn't saved. */
  remove: (root: string) => Promise<void>
  /** Saved repositories in the order they were first added, each checked for `missing` now. */
  list: () => Promise<SavedRepository[]>
  /** Whether `root` (exactly) is saved. Doesn't check the folder. */
  has: (root: string) => Promise<boolean>
}

function isStoredRepository(value: unknown): value is StoredRepository {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.root === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.lastOpenedAt === 'string'
  )
}

/** Returns the saved entries, or an empty list if the file is absent or corrupt. */
async function readEntries(filePath: string): Promise<StoredRepository[]> {
  let text: string
  try {
    text = await readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  try {
    const data: unknown = JSON.parse(text)
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { version?: unknown }).version === FILE_VERSION
    ) {
      const repositories = (data as { repositories?: unknown }).repositories
      if (Array.isArray(repositories) && repositories.every(isStoredRepository)) {
        return repositories.map(({ root, name, lastOpenedAt }) => ({ root, name, lastOpenedAt }))
      }
    }
  } catch {
    // Not JSON: fall through and start empty.
  }
  return []
}

/** Writes a temp file in the same folder, then renames it over the real one. */
async function writeEntries(filePath: string, repositories: StoredRepository[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  try {
    await writeFile(tempPath, JSON.stringify({ version: FILE_VERSION, repositories }, null, 2))
    await rename(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

/** The user's saved repositories, kept in a JSON file. Writes run one at a time. */
export function createRepositoryStore(options: RepositoryStoreOptions): RepositoryStore {
  const { filePath, now = () => new Date() } = options
  let writes: Promise<unknown> = Promise.resolve()

  /** Queues a read-modify-write so concurrent calls can't lose each other's changes. */
  function modify(change: (entries: StoredRepository[]) => StoredRepository[]): Promise<void> {
    const run = writes.then(async () => writeEntries(filePath, change(await readEntries(filePath))))
    writes = run.catch(() => undefined)
    return run
  }

  return {
    add: (root) =>
      modify((entries) => {
        const lastOpenedAt = now().toISOString()
        const existing = entries.find((entry) => entry.root === root)
        if (existing) {
          return entries.map((entry) => (entry === existing ? { ...entry, lastOpenedAt } : entry))
        }
        return [...entries, { root, name: basename(root), lastOpenedAt }]
      }),
    remove: (root) => modify((entries) => entries.filter((entry) => entry.root !== root)),
    async list() {
      await writes
      const entries = await readEntries(filePath)
      return Promise.all(
        entries.map(async (entry) => ({ ...entry, missing: !(await isRepositoryRoot(entry.root)) }))
      )
    },
    async has(root) {
      await writes
      return (await readEntries(filePath)).some((entry) => entry.root === root)
    }
  }
}

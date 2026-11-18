/**
 * Test helper: creates real, throwaway git repositories. Not used by the app.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const created: string[] = []

export interface TestRepo {
  root: string
  git: (...args: string[]) => Promise<string>
  write: (path: string, contents?: string) => Promise<void>
  /** Stages everything and commits. */
  commit: (message: string) => Promise<void>
}

/** Makes an empty temp folder. realpath matters on macOS, where /var is /private/var. */
export async function makeTempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'branches-test-')))
  created.push(dir)
  return dir
}

export function testRepoAt(root: string): TestRepo {
  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8' })
    return stdout
  }
  return {
    root,
    git,
    write: async (path, contents = `${path}\n`) => {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), contents)
    },
    commit: async (message) => {
      await git('add', '-A')
      await git('commit', '-q', '-m', message)
    }
  }
}

/** A new repository on `main` with no commits. */
export async function createRepo(initialBranch = 'main'): Promise<TestRepo> {
  const root = await makeTempDir()
  const repo = testRepoAt(root)
  await repo.git('init', '-q', '-b', initialBranch)
  await repo.git('config', 'user.name', 'Test')
  await repo.git('config', 'user.email', 'test@example.com')
  await repo.git('config', 'commit.gpgsign', 'false')
  return repo
}

/** A repository with one commit containing README.md. */
export async function createRepoWithCommit(initialBranch = 'main'): Promise<TestRepo> {
  const repo = await createRepo(initialBranch)
  await repo.write('README.md')
  await repo.commit('Initial commit')
  return repo
}

/** Clones `source` into a new temp folder, so it has an origin and upstreams. */
export async function cloneRepo(source: TestRepo): Promise<TestRepo> {
  const root = join(await makeTempDir(), 'clone')
  await execFileAsync('git', ['clone', '-q', source.root, root])
  const repo = testRepoAt(root)
  await repo.git('config', 'user.name', 'Test')
  await repo.git('config', 'user.email', 'test@example.com')
  await repo.git('config', 'commit.gpgsign', 'false')
  return repo
}

export async function cleanupTestRepos(): Promise<void> {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
}

/**
 * A bare repository holding `source`'s branches, added to `source` as `name` with each
 * branch tracking its copy there — the shape a push needs, since a non-bare remote refuses
 * a push to its checked-out branch.
 */
export async function addBareRemote(source: TestRepo, name = 'origin'): Promise<TestRepo> {
  const root = join(await makeTempDir(), `${name}.git`)
  await execFileAsync('git', ['init', '-q', '--bare', root])
  const remote = testRepoAt(root)
  await source.git('remote', 'add', name, root)
  const heads = (await source.git('for-each-ref', '--format=%(refname:short)', 'refs/heads'))
    .split('\n')
    .filter(Boolean)
  if (heads.length > 0) await source.git('push', '-q', '-u', name, ...heads)
  // Point the remote's HEAD at the source's branch, so a clone of it checks that out.
  const current = (await source.git('symbolic-ref', '-q', 'HEAD')).trim()
  await remote.git('symbolic-ref', 'HEAD', current)
  return remote
}

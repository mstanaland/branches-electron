import { afterAll, describe, expect, it } from 'vitest'
import { checkoutBranch } from './checkout'
import { GitError } from './errors'
import { cleanupTestRepos, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

describe('checkoutBranch', () => {
  it('switches to another branch', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'work')

    await checkoutBranch(repo.root, 'work')

    expect((await repo.git('branch', '--show-current')).trim()).toBe('work')
  })

  it('switches to a branch whose name has a slash', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'feature/login')

    await checkoutBranch(repo.root, 'feature/login')

    expect((await repo.git('branch', '--show-current')).trim()).toBe('feature/login')
  })

  it('carries local changes that do not conflict', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'work')
    await repo.write('scratch.txt', 'mine\n')

    await checkoutBranch(repo.root, 'work')

    expect((await repo.git('branch', '--show-current')).trim()).toBe('work')
  })

  it('is blocked by local changes, and lists the files', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('my docs/a b.txt')
    await repo.commit('Add a b')
    await repo.git('checkout', '-q', '-b', 'work')
    await repo.write('my docs/a b.txt', 'on work\n')
    await repo.write('README.md', 'on work\n')
    await repo.commit('Work')
    await repo.git('checkout', '-q', 'main')
    await repo.write('my docs/a b.txt', 'local edit\n')
    await repo.write('README.md', 'local edit\n')

    const error = await checkoutBranch(repo.root, 'work').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect(error).toMatchObject({
      code: 'CHECKOUT_BLOCKED_BY_CHANGES',
      files: ['README.md', 'my docs/a b.txt']
    })
    expect((await repo.git('branch', '--show-current')).trim()).toBe('main')
  })

  it('is blocked by an untracked file that the branch would overwrite', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('checkout', '-q', '-b', 'work')
    await repo.write('notes.txt', 'on work\n')
    await repo.commit('Add notes')
    await repo.git('checkout', '-q', 'main')
    await repo.write('notes.txt', 'untracked\n')

    await expect(checkoutBranch(repo.root, 'work')).rejects.toMatchObject({
      code: 'CHECKOUT_BLOCKED_BY_CHANGES',
      files: ['notes.txt']
    })
  })

  it('fails for a branch that does not exist', async () => {
    const repo = await createRepoWithCommit()

    await expect(checkoutBranch(repo.root, 'nope')).rejects.toMatchObject({
      code: 'COMMAND_FAILED'
    })
  })

  it('does not create a branch from a remote branch of the same name', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('update-ref', 'refs/remotes/origin/remote-only', 'HEAD')

    await expect(checkoutBranch(repo.root, 'remote-only')).rejects.toMatchObject({
      code: 'COMMAND_FAILED'
    })
    expect((await repo.git('branch', '--list', 'remote-only')).trim()).toBe('')
  })

  it('never reads a name that starts with a dash as an option', async () => {
    const repo = await createRepoWithCommit()

    await expect(checkoutBranch(repo.root, '--detach')).rejects.toMatchObject({
      code: 'COMMAND_FAILED'
    })
    expect((await repo.git('branch', '--show-current')).trim()).toBe('main')
  })

  it('fails in a repository with no commits', async () => {
    const repo = await createRepo()

    await expect(checkoutBranch(repo.root, 'main')).rejects.toBeInstanceOf(GitError)
  })

  it('runs checkouts started together one after the other', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('branch', 'a')
    await repo.git('branch', 'b')

    await Promise.all([checkoutBranch(repo.root, 'a'), checkoutBranch(repo.root, 'b')])

    expect((await repo.git('branch', '--show-current')).trim()).toBe('b')
  })
})

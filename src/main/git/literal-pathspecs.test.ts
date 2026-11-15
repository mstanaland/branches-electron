import { afterAll, describe, expect, it } from 'vitest'
import { runGit } from './run'
import { cleanupTestRepos, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

describe('runGit pathspecs', () => {
  it.each(['*.txt', '[ab].md', 'what?.log'])(
    'matches a file literally named %s and nothing else',
    async (name) => {
      const repo = await createRepoWithCommit()
      await repo.write(name)
      await repo.write('a.txt')
      await repo.write('a.md')
      await repo.write('whats.log')
      await repo.commit('add files')

      const { stdout } = await runGit(repo.root, ['ls-files', '--', name])

      expect(stdout.trim().split('\n')).toEqual([name])
    }
  )
})

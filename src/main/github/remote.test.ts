import { describe, expect, it } from 'vitest'
import { parseGitHubRemote } from './remote'

describe('parseGitHubRemote', () => {
  it.each([
    ['https://github.com/octo/hello.git', 'github.com'],
    ['https://github.com/octo/hello', 'github.com'],
    ['https://github.com/octo/hello/', 'github.com'],
    ['https://user@github.com/octo/hello.git', 'github.com'],
    ['git@github.com:octo/hello.git', 'github.com'],
    ['git@github.com:octo/hello', 'github.com'],
    ['ssh://git@github.com/octo/hello.git', 'github.com'],
    ['ssh://git@github.com:22/octo/hello.git', 'github.com'],
    ['git://github.com/octo/hello.git', 'github.com'],
    ['https://GitHub.com/octo/hello.git', 'github.com'],
    ['https://github.example.com/octo/hello.git', 'github.example.com'],
    ['git@github.example.com:octo/hello.git', 'github.example.com']
  ])('reads %s', (url, host) => {
    expect(parseGitHubRemote(url)).toEqual({ host, owner: 'octo', name: 'hello' })
  })

  it('keeps dots and dashes in a repository name', () => {
    expect(parseGitHubRemote('git@github.com:my-org/my.repo-name.git')).toEqual({
      host: 'github.com',
      owner: 'my-org',
      name: 'my.repo-name'
    })
  })

  it.each([
    ['a local path', '/Users/someone/repos/hello.git'],
    ['a file URL', 'file:///Users/someone/repos/hello.git'],
    ['a relative path', '../hello'],
    ['too few path parts', 'https://github.com/octo'],
    ['too many path parts', 'https://gitlab.com/group/subgroup/hello.git'],
    ['an empty string', ''],
    ['an option-like owner', 'git@github.com:-octo/hello.git']
  ])('refuses %s', (_case, url) => {
    expect(parseGitHubRemote(url)).toBeNull()
  })
})

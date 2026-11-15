import { describe, expect, it } from 'vitest'
import { assertRelativePath } from './path'

describe('assertRelativePath', () => {
  it.each(['README.md', 'src/main/index.ts', 'with space/a b.txt', '-leading-dash', '[a]*?.txt'])(
    'accepts %s',
    (path) => {
      expect(() => assertRelativePath(path)).not.toThrow()
    }
  )

  it.each(['..foo', 'a..b', 'dir/..hidden', 'dir/name..'])(
    'accepts %s, where ".." is part of a name',
    (path) => {
      expect(() => assertRelativePath(path)).not.toThrow()
    }
  )

  it.each(['/etc/passwd', '/', '/x'])('rejects the absolute path %s', (path) => {
    expect(() => assertRelativePath(path)).toThrowError(
      expect.objectContaining({ code: 'INVALID_PATH' })
    )
  })

  it.each(['..', '../x', 'a/../b', 'a/..', 'a/b/../../..'])(
    'rejects %s, which has a ".." segment',
    (path) => {
      expect(() => assertRelativePath(path)).toThrowError(
        expect.objectContaining({ code: 'INVALID_PATH' })
      )
    }
  )

  it('rejects an empty path', () => {
    expect(() => assertRelativePath('')).toThrowError(
      expect.objectContaining({ code: 'INVALID_PATH' })
    )
  })
})

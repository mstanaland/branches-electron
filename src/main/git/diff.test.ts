import { rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { FileDiff } from '../../shared/git'
import { getDiff, parseDiff } from './diff'
import { cleanupTestRepos, createRepo, createRepoWithCommit } from './test-repo'

afterAll(cleanupTestRepos)

/** The hunks of a diff that is known not to be binary. */
function hunksOf(diff: FileDiff | null) {
  if (diff === null || diff.binary) throw new Error('expected a text diff')
  return diff.hunks
}

/** Every line of a diff as "kind old new text", which reads like the diff itself. */
function describeLines(diff: FileDiff | null): string[] {
  return hunksOf(diff).flatMap((hunk) =>
    hunk.lines.map(
      (line) => `${line.kind} ${line.oldNumber ?? '-'} ${line.newNumber ?? '-'} ${line.text}`
    )
  )
}

describe('parseDiff', () => {
  it('parses hunks into lines with old and new numbers', () => {
    const diff = parseDiff(
      [
        'diff --git a/f.txt b/f.txt',
        'index 1111111..2222222 100644',
        '--- a/f.txt',
        '+++ b/f.txt',
        '@@ -1,3 +1,3 @@ function',
        ' one',
        '-two',
        '+TWO',
        ' three',
        ''
      ].join('\n')
    )

    expect(hunksOf(diff)).toEqual([
      {
        header: '@@ -1,3 +1,3 @@ function',
        lines: [
          { kind: 'context', oldNumber: 1, newNumber: 1, text: 'one', noNewline: false },
          { kind: 'removed', oldNumber: 2, newNumber: null, text: 'two', noNewline: false },
          { kind: 'added', oldNumber: null, newNumber: 2, text: 'TWO', noNewline: false },
          { kind: 'context', oldNumber: 3, newNumber: 3, text: 'three', noNewline: false }
        ]
      }
    ])
  })

  it('reads a removed line that looks like a file header as content', () => {
    const diff = parseDiff(
      ['--- a/f', '+++ b/f', '@@ -1,2 +1,1 @@', '--- not a header', '-- gone', '+kept', ''].join(
        '\n'
      )
    )

    expect(describeLines(diff)).toEqual([
      'removed 1 - -- not a header',
      'removed 2 - - gone',
      'added - 1 kept'
    ])
  })

  it('treats an omitted hunk length as 1', () => {
    const diff = parseDiff(['@@ -1 +1 @@', '-a', '+b', ''].join('\n'))

    expect(describeLines(diff)).toEqual(['removed 1 - a', 'added - 1 b'])
  })

  it('marks the line before "\\ No newline at end of file"', () => {
    const diff = parseDiff(
      ['@@ -1 +1 @@', '-old', '\\ No newline at end of file', '+new', ''].join('\n')
    )

    const lines = hunksOf(diff)[0].lines
    expect(lines.map((line) => line.noNewline)).toEqual([true, false])
  })

  it('finds the marker after the last counted line of a hunk', () => {
    const diff = parseDiff(
      ['@@ -1 +1 @@', '-old', '+new', '\\ No newline at end of file', ''].join('\n')
    )

    expect(hunksOf(diff)[0].lines.map((line) => line.noNewline)).toEqual([false, true])
  })

  it('splits several hunks', () => {
    const diff = parseDiff(['@@ -1 +1 @@', '-a', '+b', '@@ -10 +10 @@', '-c', '+d', ''].join('\n'))

    expect(hunksOf(diff).map((hunk) => hunk.header)).toEqual(['@@ -1 +1 @@', '@@ -10 +10 @@'])
  })

  it('recognises a binary file', () => {
    expect(
      parseDiff('diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n')
    ).toEqual({
      binary: true
    })
  })

  it('has no hunks for a rename without edits', () => {
    const diff = parseDiff(
      'diff --git a/a.txt b/b.txt\nsimilarity index 100%\nrename from a.txt\nrename to b.txt\n'
    )

    expect(diff).toEqual({ binary: false, hunks: [], truncated: false })
  })

  it('carries the truncated flag, and drops a line that was cut in half', () => {
    const diff = parseDiff('@@ -1,2 +1,2 @@\n a\n-b\n+hal', true)

    expect(diff).toMatchObject({ truncated: true })
    expect(describeLines(diff)).toEqual(['context 1 1 a', 'removed 2 - b'])
  })
})

describe('getDiff', () => {
  it('diffs a modified file as unstaged only', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('README.md', 'changed\n')

    const diff = await getDiff(repo.root, 'README.md')

    expect(diff.staged).toBeNull()
    expect(describeLines(diff.unstaged)).toEqual(['removed 1 - README.md', 'added - 1 changed'])
  })

  it('diffs a staged change as staged only', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('README.md', 'changed\n')
    await repo.git('add', 'README.md')

    const diff = await getDiff(repo.root, 'README.md')

    expect(diff.unstaged).toBeNull()
    expect(describeLines(diff.staged)).toEqual(['removed 1 - README.md', 'added - 1 changed'])
  })

  it('gives both sides for a partially staged file', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('a.txt', 'one\n')
    await repo.commit('Add a')
    await repo.write('a.txt', 'two\n')
    await repo.git('add', 'a.txt')
    await repo.write('a.txt', 'three\n')

    const diff = await getDiff(repo.root, 'a.txt')

    expect(describeLines(diff.staged)).toEqual(['removed 1 - one', 'added - 1 two'])
    expect(describeLines(diff.unstaged)).toEqual(['removed 1 - two', 'added - 1 three'])
  })

  it('diffs a file that was added to the index', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('new.txt', 'a\nb\n')
    await repo.git('add', 'new.txt')

    const diff = await getDiff(repo.root, 'new.txt')

    expect(diff.unstaged).toBeNull()
    expect(describeLines(diff.staged)).toEqual(['added - 1 a', 'added - 2 b'])
  })

  it('diffs a deleted file', async () => {
    const repo = await createRepoWithCommit()
    await rm(join(repo.root, 'README.md'))

    const diff = await getDiff(repo.root, 'README.md')

    expect(diff.staged).toBeNull()
    expect(describeLines(diff.unstaged)).toEqual(['removed 1 - README.md'])
  })

  it('diffs a file deleted in the index', async () => {
    const repo = await createRepoWithCommit()
    await repo.git('rm', '-q', 'README.md')

    const diff = await getDiff(repo.root, 'README.md')

    expect(describeLines(diff.staged)).toEqual(['removed 1 - README.md'])
    expect(diff.unstaged).toBeNull()
  })

  it('diffs an untracked file against nothing, and counts that as success', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('my docs/untracked.txt', 'x\ny\n')

    const diff = await getDiff(repo.root, 'my docs/untracked.txt')

    expect(diff.staged).toBeNull()
    expect(describeLines(diff.unstaged)).toEqual(['added - 1 x', 'added - 2 y'])
  })

  it('diffs an untracked file in a repository with no commits', async () => {
    const repo = await createRepo()
    await repo.write('first.txt', 'hello\n')

    const diff = await getDiff(repo.root, 'first.txt')

    expect(describeLines(diff.unstaged)).toEqual(['added - 1 hello'])
  })

  it('diffs a staged file in a repository with no commits', async () => {
    const repo = await createRepo()
    await repo.write('first.txt', 'hello\n')
    await repo.git('add', 'first.txt')

    const diff = await getDiff(repo.root, 'first.txt')

    expect(describeLines(diff.staged)).toEqual(['added - 1 hello'])
  })

  it.each(['a[1].txt', 'star*.txt', 'what?.txt'])(
    'diffs only the file named %s, not files its name would match as a pattern',
    async (name) => {
      const repo = await createRepoWithCommit()
      await repo.write(name, 'old\n')
      await repo.write('a1.txt', 'old\n')
      await repo.write('starfish.txt', 'old\n')
      await repo.write('whats.txt', 'old\n')
      await repo.commit('Add files')
      for (const file of [name, 'a1.txt', 'starfish.txt', 'whats.txt']) {
        await repo.write(file, 'new\n')
      }

      const diff = await getDiff(repo.root, name)

      expect(describeLines(diff.unstaged)).toEqual(['removed 1 - old', 'added - 1 new'])
    }
  )

  it('diffs an untracked file whose name has pattern characters', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('[x]*?.txt', 'fresh\n')
    await repo.write('x.txt', 'other\n')

    const diff = await getDiff(repo.root, '[x]*?.txt')

    expect(describeLines(diff.unstaged)).toEqual(['added - 1 fresh'])
  })

  it('shows a rename with edits as one staged diff when given the original path', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('old.txt', '1\n2\n3\n4\n5\n6\n')
    await repo.commit('Add old')
    await rename(join(repo.root, 'old.txt'), join(repo.root, 'new.txt'))
    await repo.write('new.txt', '1\n2\n3\n4\n5\nsix\n')
    await repo.git('add', '-A')

    const diff = await getDiff(repo.root, 'new.txt', 'old.txt')

    expect(describeLines(diff.staged)).toEqual([
      'context 3 3 3',
      'context 4 4 4',
      'context 5 5 5',
      'removed 6 - 6',
      'added - 6 six'
    ])
  })

  it('has no hunks for a rename that changed nothing', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('old.txt', 'same\n')
    await repo.commit('Add old')
    await rename(join(repo.root, 'old.txt'), join(repo.root, 'new.txt'))
    await repo.git('add', '-A')

    const diff = await getDiff(repo.root, 'new.txt', 'old.txt')

    expect(diff.staged).toEqual({ binary: false, hunks: [], truncated: false })
  })

  it('flags a binary file', async () => {
    const repo = await createRepoWithCommit()
    await writeFile(join(repo.root, 'blob.bin'), Buffer.from([0, 1, 2, 0, 255, 0]))
    await repo.commit('Add blob')
    await writeFile(join(repo.root, 'blob.bin'), Buffer.from([0, 9, 9, 0, 255, 0]))

    const diff = await getDiff(repo.root, 'blob.bin')

    expect(diff.unstaged).toEqual({ binary: true })
  })

  it('flags an untracked binary file', async () => {
    const repo = await createRepoWithCommit()
    await writeFile(join(repo.root, 'new.bin'), Buffer.from([0, 1, 2, 0]))

    const diff = await getDiff(repo.root, 'new.bin')

    expect(diff.unstaged).toEqual({ binary: true })
  })

  it('marks a file with no trailing newline', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('a.txt', 'one\n')
    await repo.commit('Add a')
    await repo.write('a.txt', 'one\ntwo')

    const diff = await getDiff(repo.root, 'a.txt')

    const lines = hunksOf(diff.unstaged).flatMap((hunk) => hunk.lines)
    expect(lines.map((line) => [line.text, line.noNewline])).toEqual([
      ['one', false],
      ['two', true]
    ])
  })

  it('has no diff for a tracked file that is unchanged', async () => {
    const repo = await createRepoWithCommit()

    await expect(getDiff(repo.root, 'README.md')).resolves.toEqual({
      staged: null,
      unstaged: null
    })
  })

  it('cuts a very large diff short and says so', async () => {
    const repo = await createRepoWithCommit()
    const big = Array.from({ length: 60_000 }, (_, i) => `line number ${i} of a big file`).join(
      '\n'
    )
    await repo.write('big.txt', `${big}\n`)

    const diff = await getDiff(repo.root, 'big.txt')

    expect(diff.unstaged).toMatchObject({ binary: false, truncated: true })
    const lines = hunksOf(diff.unstaged).flatMap((hunk) => hunk.lines)
    expect(lines.length).toBeGreaterThan(1000)
    expect(lines.length).toBeLessThan(60_000)
    // The last line is whole, not cut in the middle.
    expect(lines.at(-1)?.text).toMatch(/^line number \d+ of a big file$/)
  })

  it('does not truncate a diff under the limit', async () => {
    const repo = await createRepoWithCommit()
    await repo.write('small.txt', 'a\n')

    const diff = await getDiff(repo.root, 'small.txt')

    expect(diff.unstaged).toMatchObject({ truncated: false })
  })
})

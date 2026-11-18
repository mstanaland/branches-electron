import { describe, expect, it } from 'vitest'
import type { SavedRepository } from '../shared/git'
import { createWindowTitle } from './windowTitle'

const saved = (root: string, name: string): SavedRepository => ({
  root,
  name,
  lastOpenedAt: '2026-11-17T00:00:00.000Z',
  missing: false
})

/** A window title over a fixed saved list, recording every title it sets. */
function newWindowTitle(repositories: SavedRepository[] = [saved('/repos/alpha', 'alpha')]) {
  return windowTitleReading(async () => repositories)
}

/** A window title over whatever the saved list does, including taking its time or failing. */
function windowTitleReading(list: () => Promise<SavedRepository[]>) {
  const titles: string[] = []
  const windowTitle = createWindowTitle({
    appName: 'Branches',
    list,
    setTitle: (value) => titles.push(value)
  })
  return { windowTitle, titles }
}

describe('follow', () => {
  it('names the active repository', async () => {
    const { windowTitle, titles } = newWindowTitle()

    await windowTitle.follow('/repos/alpha')

    expect(titles).toEqual(['alpha'])
  })

  it('says the application name with no repository in front', async () => {
    const { windowTitle, titles } = newWindowTitle()

    await windowTitle.follow(null)

    expect(titles).toEqual(['Branches'])
  })

  it("falls back to the folder's name for a repository the saved list doesn't hold", async () => {
    const { windowTitle, titles } = newWindowTitle()

    await windowTitle.follow('/repos/unsaved name')

    // What the tab itself says, rather than a window named after the app over a repository.
    expect(titles).toEqual(['unsaved name'])
  })

  it('falls back to the folder name when the saved list cannot be read', async () => {
    const { windowTitle, titles } = windowTitleReading(() => Promise.reject(new Error('no file')))

    await windowTitle.follow('/repos/alpha')

    expect(titles).toEqual(['alpha'])
  })

  it('ends on the latest repository when two reads land out of order', async () => {
    const repositories = [saved('/repos/alpha', 'alpha'), saved('/repos/beta', 'beta')]
    const pending: Array<() => void> = []
    const { windowTitle, titles } = windowTitleReading(
      () => new Promise((resolve) => pending.push(() => resolve(repositories)))
    )

    const first = windowTitle.follow('/repos/alpha')
    const second = windowTitle.follow('/repos/beta')
    // The switch away is read back first, as a slow first read would leave it.
    pending[1]()
    pending[0]()
    await Promise.all([first, second])

    expect(titles.at(-1)).toBe('beta')
  })
})

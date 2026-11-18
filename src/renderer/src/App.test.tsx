// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/apiError'
import type { RepositoryStatus, SavedRepository } from '../../shared/git'
import type { TabCommand } from '../../shared/tabs'
import type { RendererApi } from './api'
import { renderWithProviders } from './data/testUtils'

const api = vi.hoisted(() => ({
  openRepository: vi.fn<RendererApi['openRepository']>(),
  listRepositories: vi.fn<RendererApi['listRepositories']>(),
  showRepositoryMenu: vi.fn<RendererApi['showRepositoryMenu']>(),
  confirmRemoveMissingRepository: vi.fn<RendererApi['confirmRemoveMissingRepository']>(),
  getStatus: vi.fn<RendererApi['getStatus']>(),
  listBranches: vi.fn<RendererApi['listBranches']>(),
  listCommits: vi.fn<RendererApi['listCommits']>(),
  setActiveRepository: vi.fn<RendererApi['setActiveRepository']>(),
  fetchRepository: vi.fn<RendererApi['fetchRepository']>(),
  pullRepository: vi.fn<RendererApi['pullRepository']>(),
  setTabCount: vi.fn<RendererApi['setTabCount']>(),
  onOpenRepositoryRequested: vi.fn<RendererApi['onOpenRepositoryRequested']>(),
  onTabCommand: vi.fn<RendererApi['onTabCommand']>(),
  onRemoteRefsChanged: vi.fn<RendererApi['onRemoteRefsChanged']>()
}))
vi.mock('./api', () => ({ api }))

import App from './App'

const repo = (name: string, missing = false): SavedRepository => ({
  root: `/repos/${name}`,
  name,
  lastOpenedAt: '2026-11-14T00:00:00.000Z',
  missing
})

const status = (branch: string, overrides: Partial<RepositoryStatus> = {}): RepositoryStatus => ({
  branch,
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [],
  ...overrides
})

/** A status whose branch is `behind` commits behind an upstream, so Pull has work to do. */
const behindBy = (branch: string, behind: number): RepositoryStatus =>
  status(branch, { upstream: 'origin/main', behind })

/** The labels in the tab strip, left to right, or null when there is no strip at all. */
function tabLabels(): string[] | null {
  const strip = screen.queryByRole('navigation', { name: 'Tabs' })
  if (strip === null) return null
  return screen
    .getAllByRole('listitem')
    .filter((item) => strip.contains(item))
    .map((item) => item.textContent ?? '')
}

/** The focused tab's label. The sidebar marks its selected view the same way, so scope it. */
function focusedTab(): string | undefined {
  const strip = screen.queryByRole('navigation', { name: 'Tabs' })
  if (strip === null) return undefined
  return within(strip).queryByRole('button', { current: true })?.textContent ?? undefined
}

/** Opens `name` in a tab from whichever Repositories surface is showing. */
async function choose(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole('option', { name }))
}

/** The Window-menu listeners the app has registered, newest last. */
let tabCommandListeners: Array<(command: TabCommand) => void> = []

/** Runs a Window-menu item, the way main's menu does when its accelerator is pressed. */
async function menu(command: TabCommand): Promise<void> {
  await act(async () => {
    for (const listener of tabCommandListeners) listener(command)
  })
}

/** Opens a Repositories tab with `+`. */
function newTab(): void {
  fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.onOpenRepositoryRequested.mockReturnValue(() => {})
  tabCommandListeners = []
  api.onTabCommand.mockImplementation((listener) => {
    tabCommandListeners.push(listener)
    return () => {
      tabCommandListeners = tabCommandListeners.filter((entry) => entry !== listener)
    }
  })
  api.setTabCount.mockResolvedValue(undefined)
  api.onRemoteRefsChanged.mockReturnValue(() => {})
  api.setActiveRepository.mockResolvedValue(undefined)
  api.fetchRepository.mockResolvedValue(undefined)
  api.pullRepository.mockResolvedValue(undefined)
  api.listBranches.mockResolvedValue([])
  api.listCommits.mockResolvedValue([])
  api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta'), repo('gamma')])
  api.getStatus.mockImplementation(async (root) => status(`${root.split('/').pop()}-main`))
})

afterEach(cleanup)

describe('the backdrop', () => {
  it('is what a first launch shows: the Repositories surface, with no tab to close', async () => {
    renderWithProviders(<App />)

    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Repository…' })).toBeTruthy()
    expect(tabLabels()).toBeNull()
    expect(screen.queryByRole('button', { name: /^Close / })).toBeNull()
    // Nothing to switch views within, so no sidebar either.
    expect(screen.queryByRole('button', { name: /working/i })).toBeNull()
  })

  it('comes back when the last tab is closed', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close alpha' }))

    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
    expect(tabLabels()).toBeNull()
    expect(screen.queryByText('alpha-main')).toBeNull()
  })
})

describe('opening repositories into tabs', () => {
  it('puts the chosen repository in a tab, showing its working changes', async () => {
    renderWithProviders(<App />)

    await choose('alpha')

    expect(tabLabels()).toEqual(['alpha'])
    expect(focusedTab()).toBe('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()
    expect(screen.getByRole('button', { name: /working/i })).toBeTruthy()
  })

  it('opens one tab per repository, through + each time', async () => {
    renderWithProviders(<App />)

    await choose('alpha')
    newTab()
    await choose('beta')
    newTab()
    await choose('gamma')

    expect(tabLabels()).toEqual(['alpha', 'beta', 'gamma'])
    expect(focusedTab()).toBe('gamma')
  })

  it('shows a Repositories tab for +, and converts it in place when one is chosen', async () => {
    renderWithProviders(<App />)
    await choose('alpha')

    newTab()
    expect(tabLabels()).toEqual(['alpha', 'Repositories'])
    expect(await screen.findByRole('option', { name: 'beta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Repository…' })).toBeTruthy()

    await choose('beta')

    expect(tabLabels()).toEqual(['alpha', 'beta'])
    expect(await screen.findByText('beta-main')).toBeTruthy()
  })

  it('converts the same tab when Open Repository… picks a folder, and nothing when cancelled', async () => {
    api.openRepository.mockResolvedValueOnce(null)
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()

    fireEvent.click(screen.getByRole('button', { name: 'Open Repository…' }))
    await waitFor(() => expect(api.openRepository).toHaveBeenCalledOnce())
    expect(tabLabels()).toEqual(['alpha', 'Repositories'])

    api.listRepositories.mockResolvedValue([repo('alpha'), repo('delta')])
    api.openRepository.mockResolvedValue('/repos/delta')
    fireEvent.click(screen.getByRole('button', { name: 'Open Repository…' }))

    await waitFor(() => expect(tabLabels()).toEqual(['alpha', 'delta']))
    expect(await screen.findByText('delta-main')).toBeTruthy()
  })

  it('focuses the existing tab and closes the Repositories tab it was chosen from', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    newTab()
    expect(tabLabels()).toEqual(['alpha', 'beta', 'Repositories'])

    await choose('alpha')

    expect(tabLabels()).toEqual(['alpha', 'beta'])
    expect(focusedTab()).toBe('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()
  })

  it('hides + once four tabs are open, counting a Repositories tab', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta'), repo('gamma')])
    renderWithProviders(<App />)

    await choose('alpha')
    newTab()
    await choose('beta')
    newTab()
    await choose('gamma')
    expect(screen.getByRole('button', { name: 'New tab' })).toBeTruthy()

    newTab()

    expect(tabLabels()).toEqual(['alpha', 'beta', 'gamma', 'Repositories'])
    expect(screen.queryByRole('button', { name: 'New tab' })).toBeNull()
  })
})

describe('File > Open Repository… (Cmd+O)', () => {
  it('opens a new tab from a repository tab, with no Repositories tab in between', async () => {
    const listeners: Array<() => void> = []
    api.onOpenRepositoryRequested.mockImplementation((listener) => {
      listeners.push(listener)
      return () => {}
    })
    renderWithProviders(<App />)
    await choose('alpha')

    api.listRepositories.mockResolvedValue([repo('alpha'), repo('delta')])
    api.openRepository.mockResolvedValue('/repos/delta')
    await act(async () => listeners[0]())

    await waitFor(() => expect(tabLabels()).toEqual(['alpha', 'delta']))
    expect(focusedTab()).toBe('delta')
  })

  it('focuses the tab a repository is already in rather than opening a second', async () => {
    const listeners: Array<() => void> = []
    api.onOpenRepositoryRequested.mockImplementation((listener) => {
      listeners.push(listener)
      return () => {}
    })
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')

    api.openRepository.mockResolvedValue('/repos/alpha')
    await act(async () => listeners[0]())

    await waitFor(() => expect(focusedTab()).toBe('alpha'))
    expect(tabLabels()).toEqual(['alpha', 'beta'])
  })
})

describe('switching tabs', () => {
  it('shows one changes pane and one diff pane, for the focused tab', async () => {
    renderWithProviders(<App />)

    await choose('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()
    newTab()
    await choose('beta')
    expect(await screen.findByText('beta-main')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))

    expect(await screen.findByText('alpha-main')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getAllByText('No changes')).toHaveLength(1)
      expect(screen.getAllByText('Select a file to see its changes')).toHaveLength(1)
    })
    expect(screen.queryByText('beta-main')).toBeNull()
  })

  it('keeps each tab on its own view', async () => {
    api.listBranches.mockResolvedValue([
      {
        name: 'main',
        isCurrent: true,
        shortOid: 'abc1234',
        upstream: null,
        upstreamGone: false,
        ahead: 0,
        behind: 0
      }
    ])
    renderWithProviders(<App />)
    await choose('alpha')
    fireEvent.click(await screen.findByRole('treeitem', { name: 'main' }))
    await waitFor(() => expect(api.listCommits).toHaveBeenCalled())

    newTab()
    await choose('beta')
    // A fresh tab starts at Working, not at the view the other tab is on.
    expect(await screen.findByText('beta-main')).toBeTruthy()
    expect(screen.getByRole('button', { name: /working/i }).getAttribute('aria-current')).toBe(
      'true'
    )

    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))

    const working = await screen.findByRole('button', { name: /working/i })
    expect(working.getAttribute('aria-current')).toBeNull()
    expect(
      (await screen.findByRole('treeitem', { name: 'main' })).getAttribute('aria-selected')
    ).toBe('true')
  })

  it('keeps each tab on its own selected change', async () => {
    api.getStatus.mockImplementation(async (root) => {
      const name = root.split('/').pop() ?? ''
      return {
        ...status(`${name}-main`),
        changes: [
          {
            path: `${name}.txt`,
            originalPath: null,
            index: null,
            worktree: 'modified' as const,
            kind: 'ordinary' as const
          }
        ]
      }
    })
    renderWithProviders(<App />)
    await choose('alpha')
    fireEvent.click(await screen.findByRole('button', { name: /alpha\.txt/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /alpha\.txt/ }).getAttribute('aria-pressed')).toBe(
        'true'
      )
    )

    newTab()
    await choose('beta')
    expect(
      (await screen.findByRole('button', { name: /beta\.txt/ })).getAttribute('aria-pressed')
    ).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /alpha\.txt/ }).getAttribute('aria-pressed')).toBe(
        'true'
      )
    )
  })
})

describe('closing tabs', () => {
  it('offers × on the focused tab, and on a tab the pointer is over', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')

    expect(screen.getByRole('button', { name: 'Close beta' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close alpha' })).toBeNull()

    const [alphaTab] = screen.getAllByRole('listitem')
    fireEvent.pointerEnter(alphaTab)
    expect(screen.getByRole('button', { name: 'Close alpha' })).toBeTruthy()

    fireEvent.pointerLeave(alphaTab)
    expect(screen.queryByRole('button', { name: 'Close alpha' })).toBeNull()
  })

  it('closes the tab, leaving the others and focusing a neighbour', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')

    fireEvent.click(screen.getByRole('button', { name: 'Close beta' }))

    expect(tabLabels()).toEqual(['alpha'])
    expect(focusedTab()).toBe('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()
  })

  it('brings + back when a tab closes at the limit', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    newTab()
    await choose('gamma')
    newTab()
    expect(screen.queryByRole('button', { name: 'New tab' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close Repositories' }))

    expect(screen.getByRole('button', { name: 'New tab' })).toBeTruthy()
  })
})

describe('persistence', () => {
  it('brings the tabs and the focused one back, each starting at Working', async () => {
    api.listBranches.mockResolvedValue([
      {
        name: 'main',
        isCurrent: true,
        shortOid: 'abc1234',
        upstream: null,
        upstreamGone: false,
        ahead: 0,
        behind: 0
      }
    ])
    const first = renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    fireEvent.click(await screen.findByRole('treeitem', { name: 'main' }))
    await waitFor(() => expect(api.listCommits).toHaveBeenCalled())
    first.unmount()

    renderWithProviders(<App />)

    await waitFor(() => expect(tabLabels()).toEqual(['alpha', 'beta']))
    expect(focusedTab()).toBe('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()
    expect(
      (await screen.findByRole('button', { name: /working/i })).getAttribute('aria-current')
    ).toBe('true')
  })

  it('shows the backdrop when localStorage throws rather than crashing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderWithProviders(<App />)

    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
    expect(tabLabels()).toBeNull()

    // And still opens a tab, which simply won't be there next launch.
    await choose('alpha')
    expect(tabLabels()).toEqual(['alpha'])
    vi.restoreAllMocks()
  })

  it('shows the backdrop when nothing was saved', async () => {
    renderWithProviders(<App />)

    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
    expect(tabLabels()).toBeNull()
  })
})

describe('the active repository', () => {
  it('follows the focused tab, and is nothing on a Repositories tab', async () => {
    renderWithProviders(<App />)
    expect(api.setActiveRepository).toHaveBeenCalledWith(null)

    await choose('alpha')
    await waitFor(() => expect(api.setActiveRepository).toHaveBeenLastCalledWith('/repos/alpha'))

    newTab()
    await waitFor(() => expect(api.setActiveRepository).toHaveBeenLastCalledWith(null))

    await choose('beta')
    await waitFor(() => expect(api.setActiveRepository).toHaveBeenLastCalledWith('/repos/beta'))

    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    await waitFor(() => expect(api.setActiveRepository).toHaveBeenLastCalledWith('/repos/alpha'))
  })
})

describe('Fetch', () => {
  const fetchButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: 'Fetch' }) as HTMLButtonElement

  it('fetches the focused tab\u2019s repository and re-reads its ahead/behind counts', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')
    const statusReads = api.getStatus.mock.calls.length

    fireEvent.click(fetchButton())

    await waitFor(() => expect(api.fetchRepository).toHaveBeenCalledWith('/repos/alpha'))
    // The counts come from status and branches, which are both read again once it lands.
    await waitFor(() => expect(api.getStatus.mock.calls.length).toBeGreaterThan(statusReads))
    expect(api.listBranches).toHaveBeenCalledWith('/repos/alpha')
  })

  it('acts on whichever tab is focused', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    await screen.findByText('beta-main')

    fireEvent.click(fetchButton())

    await waitFor(() => expect(api.fetchRepository).toHaveBeenCalledWith('/repos/beta'))
  })

  it('reports a failure, unlike the background fetch', async () => {
    api.fetchRepository.mockRejectedValue(
      new ApiError({
        code: 'COMMAND_FAILED',
        message: 'git fetch failed: could not read from remote'
      })
    )
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')

    fireEvent.click(fetchButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('could not read from remote')
  })

  it('leaves one repository\u2019s failure behind when another tab is focused', async () => {
    api.fetchRepository.mockRejectedValue(
      new ApiError({ code: 'NO_REMOTE', message: 'This repository has no remote to fetch from.' })
    )
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    await screen.findByText('beta-main')
    fireEvent.click(fetchButton())
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('says it is working and cannot be fired twice at once', async () => {
    let finish = (): void => {}
    api.fetchRepository.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = () => resolve()
        })
    )
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')

    fireEvent.click(fetchButton())

    await waitFor(() => expect(fetchButton().disabled).toBe(true))
    expect(fetchButton().getAttribute('aria-busy')).toBe('true')
    fireEvent.click(fetchButton())
    expect(api.fetchRepository).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish()
    })
    await waitFor(() => expect(fetchButton().disabled).toBe(false))
  })

  it('stays in flight, and unrepeatable, across a tab switch and back', async () => {
    let finish = (): void => {}
    api.fetchRepository.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = () => resolve()
        })
    )
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    await screen.findByText('beta-main')
    fireEvent.click(fetchButton())
    await waitFor(() => expect(fetchButton().disabled).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    await waitFor(() => expect(fetchButton().disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'beta' }))

    expect(fetchButton().disabled).toBe(true)
    fireEvent.click(fetchButton())
    expect(api.fetchRepository).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish()
    })
    await waitFor(() => expect(fetchButton().disabled).toBe(false))
  })

  it('is disabled for a repository whose folder is gone', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha', true), repo('beta')])
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha can’t be found')

    expect(fetchButton().disabled).toBe(true)
  })

  it('is disabled on a Repositories tab and on the backdrop', async () => {
    renderWithProviders(<App />)

    expect(fetchButton().disabled).toBe(true)

    await choose('alpha')
    await waitFor(() => expect(fetchButton().disabled).toBe(false))

    newTab()
    expect(fetchButton().disabled).toBe(true)
    fireEvent.click(fetchButton())
    expect(api.fetchRepository).not.toHaveBeenCalled()
  })
})

describe('the sidebar', () => {
  it('holds no repository list and no foldable repository header', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
    expect(screen.queryByRole('button', { expanded: true })).toBeNull()
    expect(screen.queryByRole('button', { name: /open repository/i })).toBeNull()
  })
})

describe('removing a repository from the saved list', () => {
  it('closes the tab showing it', async () => {
    api.showRepositoryMenu.mockResolvedValue(true)
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    newTab()

    api.listRepositories.mockResolvedValue([repo('beta'), repo('gamma')])
    fireEvent.contextMenu(await screen.findByRole('option', { name: 'alpha' }))

    await waitFor(() => expect(tabLabels()).toEqual(['beta', 'Repositories']))
  })
})

describe('a tab for a missing repository', () => {
  it('flags it in the tab label', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha', true), repo('beta')])
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })

    const label = await screen.findByRole('button', { name: 'alpha' })
    await waitFor(() =>
      expect(label.getAttribute('aria-description')).toBe('alpha can’t be found.')
    )
  })

  it('explains the folder cannot be found, instead of branches and changes', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha', true), repo('beta')])
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })

    expect(await screen.findByText('alpha can’t be found')).toBeTruthy()
    expect(screen.getByText(/\/repos\/alpha/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove from List' })).toBeTruthy()
    // No branches to read, so no sidebar, and no panes over a folder that isn't there.
    expect(screen.queryByRole('button', { name: /working/i })).toBeNull()
    expect(screen.queryByText('Select a file to see its changes')).toBeNull()
  })

  it('removes the saved repository and closes the tab once removal is confirmed', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha', true), repo('beta')])
    api.confirmRemoveMissingRepository.mockResolvedValue(true)
    renderWithProviders(<App />, { tabs: ['/repos/alpha', '/repos/beta'] })
    const remove = await screen.findByRole('button', { name: 'Remove from List' })

    // Pinned before the click: what the list says afterwards shouldn't depend on when the
    // invalidated refetch happens to run.
    api.listRepositories.mockResolvedValue([repo('beta')])
    fireEvent.click(remove)

    await waitFor(() =>
      expect(api.confirmRemoveMissingRepository).toHaveBeenCalledWith('/repos/alpha')
    )
    await waitFor(() => expect(tabLabels()).toEqual(['beta']))
    expect(await screen.findByText('beta-main')).toBeTruthy()
  })

  it('leaves the saved repository and the tab alone when removal is cancelled', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha', true), repo('beta')])
    api.confirmRemoveMissingRepository.mockResolvedValue(false)
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })

    fireEvent.click(await screen.findByRole('button', { name: 'Remove from List' }))

    await waitFor(() =>
      expect(api.confirmRemoveMissingRepository).toHaveBeenCalledWith('/repos/alpha')
    )
    expect(tabLabels()).toEqual(['alpha'])
    expect(screen.getByText('alpha can’t be found')).toBeTruthy()
    newTab()
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
  })

  it('leaves the saved entry intact when the tab is closed without removing it', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha', true), repo('beta')])
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha can’t be found')

    fireEvent.click(screen.getByRole('button', { name: 'Close alpha' }))

    expect(tabLabels()).toBeNull()
    expect(api.confirmRemoveMissingRepository).not.toHaveBeenCalled()
    // Still on the backdrop's saved list, flagged, waiting to be dealt with.
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
  })
})

describe('the Window menu', () => {
  it('opens a Repositories tab on New Tab (Cmd+T)', async () => {
    renderWithProviders(<App />)
    await choose('alpha')

    await menu({ type: 'new' })

    expect(tabLabels()).toEqual(['alpha', 'Repositories'])
    expect(focusedTab()).toBe('Repositories')
    expect(await screen.findByRole('option', { name: 'beta' })).toBeTruthy()
  })

  it('closes the focused tab on Close Tab (Cmd+W), focusing a neighbour', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')

    await menu({ type: 'close' })

    expect(tabLabels()).toEqual(['alpha'])
    expect(focusedTab()).toBe('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()
  })

  it('leaves the backdrop when the last tab is closed, rather than the window going', async () => {
    renderWithProviders(<App />)
    await choose('alpha')

    await menu({ type: 'close' })

    expect(tabLabels()).toBeNull()
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
    // Nothing left for a second Cmd+W to close but the window, which is main's to do.
    await waitFor(() => expect(api.setTabCount).toHaveBeenLastCalledWith(0))
  })

  it('focuses the nth tab on Cmd+1 to Cmd+4, and does nothing without an nth tab', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    expect(focusedTab()).toBe('beta')

    await menu({ type: 'focus', index: 0 })
    expect(focusedTab()).toBe('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()

    await menu({ type: 'focus', index: 1 })
    expect(focusedTab()).toBe('beta')

    await menu({ type: 'focus', index: 3 })

    expect(focusedTab()).toBe('beta')
    expect(tabLabels()).toEqual(['alpha', 'beta'])
  })

  it('steps through the strip on Show Previous Tab and Show Next Tab, wrapping round', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    newTab()
    await choose('gamma')

    await menu({ type: 'previous' })
    expect(focusedTab()).toBe('beta')

    await menu({ type: 'next' })
    expect(focusedTab()).toBe('gamma')

    // Past the right-hand end, round to the first.
    await menu({ type: 'next' })
    expect(focusedTab()).toBe('alpha')

    // And back off the left-hand end, round to the last.
    await menu({ type: 'previous' })
    expect(focusedTab()).toBe('gamma')
  })

  it('opens no fifth tab, so a stale New Tab cannot get past the limit', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    newTab()
    await choose('gamma')
    newTab()
    expect(tabLabels()).toEqual(['alpha', 'beta', 'gamma', 'Repositories'])

    await menu({ type: 'new' })

    expect(tabLabels()).toEqual(['alpha', 'beta', 'gamma', 'Repositories'])
  })

  it('tells main how many tabs there are, so the menu can disable what the strip cannot do', async () => {
    renderWithProviders(<App />)
    await waitFor(() => expect(api.setTabCount).toHaveBeenLastCalledWith(0))

    await choose('alpha')
    await waitFor(() => expect(api.setTabCount).toHaveBeenLastCalledWith(1))

    newTab()
    await waitFor(() => expect(api.setTabCount).toHaveBeenLastCalledWith(2))

    await menu({ type: 'close' })
    await waitFor(() => expect(api.setTabCount).toHaveBeenLastCalledWith(1))
  })
})

describe('Pull', () => {
  const pullButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: /^Pull/ }) as HTMLButtonElement

  /** Puts `alpha` behind its upstream by `behind`, then opens it in a focused tab. */
  async function openBehind(behind: number): Promise<void> {
    api.getStatus.mockImplementation(async (root) =>
      behindBy(`${root.split('/').pop()}-main`, behind)
    )
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')
  }

  it('is disabled on the backdrop, where there is no repository to pull into', async () => {
    renderWithProviders(<App />)
    await screen.findByRole('option', { name: 'alpha' })

    expect(pullButton().disabled).toBe(true)
  })

  it('says how far behind the branch is', async () => {
    await openBehind(3)

    await waitFor(() => expect(pullButton().disabled).toBe(false))
    expect(pullButton().textContent).toContain('3')
  })

  it('is disabled when the branch is level with its upstream', async () => {
    await openBehind(0)

    await waitFor(() => expect(screen.getByText('alpha-main')).toBeTruthy())
    expect(pullButton().disabled).toBe(true)
  })

  it('is disabled when the branch tracks no upstream', async () => {
    api.getStatus.mockImplementation(async (root) => status(`${root.split('/').pop()}-main`))
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')

    expect(pullButton().disabled).toBe(true)
  })

  it('is disabled on a detached HEAD, which has no upstream to pull from', async () => {
    api.getStatus.mockImplementation(async () =>
      status('detached', { branch: null, detached: true, upstream: 'origin/main', behind: 2 })
    )
    renderWithProviders(<App />)
    await choose('alpha')
    await waitFor(() => expect(api.getStatus).toHaveBeenCalledWith('/repos/alpha'))

    await waitFor(() => expect(pullButton().disabled).toBe(true))
  })

  it('pulls the focused tab’s repository and re-reads what it changed', async () => {
    api.getStatus.mockImplementation(async (root) => behindBy(`${root.split('/').pop()}-main`, 2))
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    await screen.findByText('beta-main')
    await waitFor(() => expect(pullButton().disabled).toBe(false))
    const statusReads = api.getStatus.mock.calls.length

    fireEvent.click(pullButton())

    await waitFor(() => expect(api.pullRepository).toHaveBeenCalledWith('/repos/beta'))
    // A pull moves HEAD and rewrites files, so the whole repository is re-read, not just
    // the ahead/behind counts a fetch touches.
    await waitFor(() => expect(api.getStatus.mock.calls.length).toBeGreaterThan(statusReads))
    expect(api.listBranches).toHaveBeenCalledWith('/repos/beta')
  })

  it('reports a branch that cannot be fast-forwarded', async () => {
    api.pullRepository.mockRejectedValue(
      new ApiError({
        code: 'PULL_NOT_FAST_FORWARD',
        message: 'main has diverged from its upstream, so it can’t be fast-forwarded.'
      })
    )
    await openBehind(1)
    await waitFor(() => expect(pullButton().disabled).toBe(false))

    fireEvent.click(pullButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('diverged')
  })

  it('gives up the row to Fetch once Fetch is the more recent operation', async () => {
    api.pullRepository.mockRejectedValue(
      new ApiError({
        code: 'PULL_NOT_FAST_FORWARD',
        message: 'main has diverged from its upstream, so it can\u2019t be fast-forwarded.'
      })
    )
    await openBehind(1)
    await waitFor(() => expect(pullButton().disabled).toBe(false))
    fireEvent.click(pullButton())
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))

    // The row holds one failure for two operations, so a fetch that works clears the pull's.
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('takes the row back from Fetch when the pull is the more recent operation', async () => {
    api.fetchRepository.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git fetch failed: host unreachable' })
    )
    await openBehind(1)
    await waitFor(() => expect(pullButton().disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
    expect((await screen.findByRole('alert')).textContent).toContain('host unreachable')

    fireEvent.click(pullButton())

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('says it is working and cannot be fired twice at once', async () => {
    let finish = (): void => {}
    api.pullRepository.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = () => resolve()
        })
    )
    await openBehind(1)
    await waitFor(() => expect(pullButton().disabled).toBe(false))

    fireEvent.click(pullButton())

    await waitFor(() => expect(pullButton().disabled).toBe(true))
    expect(pullButton().getAttribute('aria-busy')).toBe('true')
    fireEvent.click(pullButton())
    expect(api.pullRepository).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish()
    })
  })
})

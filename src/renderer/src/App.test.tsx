// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryStatus, SavedRepository } from '../../shared/git'
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
  onOpenRepositoryRequested: vi.fn<RendererApi['onOpenRepositoryRequested']>(),
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

const status = (branch: string): RepositoryStatus => ({
  branch,
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: []
})

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

/** Opens a Repositories tab with `+`. */
function newTab(): void {
  fireEvent.click(screen.getByRole('button', { name: 'New tab' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.onOpenRepositoryRequested.mockReturnValue(() => {})
  api.onRemoteRefsChanged.mockReturnValue(() => {})
  api.setActiveRepository.mockResolvedValue(undefined)
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

    fireEvent.click(await screen.findByRole('button', { name: 'Remove from List' }))

    await waitFor(() =>
      expect(api.confirmRemoveMissingRepository).toHaveBeenCalledWith('/repos/alpha')
    )
    api.listRepositories.mockResolvedValue([repo('beta')])
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

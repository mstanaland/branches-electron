// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/apiError'
import type {
  Branch,
  Commit,
  CommitDetails,
  PublishTarget,
  RepositoryStatus,
  SavedRepository
} from '../../shared/git'
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
  listMergedBranches: vi.fn<RendererApi['listMergedBranches']>(),
  listCommits: vi.fn<RendererApi['listCommits']>(),
  listUnpushedCommits: vi.fn<RendererApi['listUnpushedCommits']>(),
  getCommitDetails: vi.fn<RendererApi['getCommitDetails']>(),
  listCommitFiles: vi.fn<RendererApi['listCommitFiles']>(),
  getCommitFileDiff: vi.fn<RendererApi['getCommitFileDiff']>(),
  setActiveRepository: vi.fn<RendererApi['setActiveRepository']>(),
  cancelGenerate: vi.fn<RendererApi['cancelGenerate']>(),
  fetchRepository: vi.fn<RendererApi['fetchRepository']>(),
  pullRepository: vi.fn<RendererApi['pullRepository']>(),
  pushRepository: vi.fn<RendererApi['pushRepository']>(),
  publishBranch: vi.fn<RendererApi['publishBranch']>(),
  getPublishTarget: vi.fn<RendererApi['getPublishTarget']>(),
  setTabCount: vi.fn<RendererApi['setTabCount']>(),
  onOpenRepositoryRequested: vi.fn<RendererApi['onOpenRepositoryRequested']>(),
  onTabCommand: vi.fn<RendererApi['onTabCommand']>(),
  onRemoteRefsChanged: vi.fn<RendererApi['onRemoteRefsChanged']>(),
  onMergedBranchesChanged: vi.fn<RendererApi['onMergedBranchesChanged']>()
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

const mainBranch: Branch = {
  name: 'main',
  isCurrent: true,
  shortOid: 'abc1234',
  upstream: null,
  upstreamGone: false,
  checkedOutElsewhere: false,
  ahead: 0,
  behind: 0
}

/** A status whose branch is `behind` commits behind an upstream, so Pull has work to do. */
const behindBy = (branch: string, behind: number): RepositoryStatus =>
  status(branch, { upstream: 'origin/main', behind })

/** Where a branch can go: by default, a repository with one remote, `origin`. */
const publishTarget = (
  branch: string | null,
  overrides: Partial<PublishTarget> = {}
): PublishTarget => ({
  branch,
  remotes: [{ name: 'origin', url: 'git@example.com:me/repo.git', hasBranch: false }],
  goneFrom: null,
  ...overrides
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
  api.onMergedBranchesChanged.mockReturnValue(() => {})
  api.setActiveRepository.mockResolvedValue(undefined)
  api.cancelGenerate.mockResolvedValue(undefined)
  api.fetchRepository.mockResolvedValue(undefined)
  api.pullRepository.mockResolvedValue(undefined)
  api.pushRepository.mockResolvedValue(undefined)
  api.publishBranch.mockResolvedValue(undefined)
  api.getPublishTarget.mockImplementation(async (root) =>
    publishTarget(`${root.split('/').pop()}-main`)
  )
  api.listBranches.mockResolvedValue([])
  api.listMergedBranches.mockResolvedValue([])
  api.listCommits.mockResolvedValue([])
  api.listUnpushedCommits.mockResolvedValue([])
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
        checkedOutElsewhere: false,
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
  it('gives every open tab a close button', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')

    // The × is shown with CSS on the focused tab and on hover. jsdom does not apply that,
    // so both buttons are in the tree here.
    expect(screen.getByRole('button', { name: 'Close beta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close alpha' })).toBeTruthy()
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
        checkedOutElsewhere: false,
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

const fetchButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'Fetch' }) as HTMLButtonElement

describe('Fetch', () => {
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
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    api.fetchRepository.mockReturnValue(promise)
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
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    api.fetchRepository.mockReturnValue(promise)
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

/** The separator on one column boundary, by the column it resizes. */
const boundary = (name: 'Sidebar width' | 'Changes width'): HTMLElement =>
  screen.getByRole('separator', { name })

const width = (name: 'Sidebar width' | 'Changes width'): number =>
  Number(boundary(name).getAttribute('aria-valuenow'))

describe('column widths', () => {
  it('resizes with a pointer without moving focus to the separator', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')
    const handle = boundary('Sidebar width')
    const start = width('Sidebar width')
    const focused = document.activeElement
    // jsdom does not implement pointer capture.
    handle.setPointerCapture = vi.fn<HTMLElement['setPointerCapture']>()
    handle.hasPointerCapture = () => false

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 260 })
    expect(handle.getAttribute('data-dragging')).toBe('true')
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 280 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 280 })

    expect(width('Sidebar width')).toBe(start + 20)
    expect(handle.hasAttribute('data-dragging')).toBe(false)
    expect(document.activeElement).toBe(focused)
  })

  it('nudges the sidebar boundary with the arrow keys', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')
    const start = width('Sidebar width')

    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowRight' })
    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowRight' })
    expect(width('Sidebar width')).toBe(start + 20)

    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowLeft' })
    expect(width('Sidebar width')).toBe(start + 10)
  })

  it('nudges the changes / diff boundary with the arrow keys', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')
    const start = width('Changes width')

    fireEvent.keyDown(boundary('Changes width'), { key: 'ArrowLeft' })
    expect(width('Changes width')).toBe(start - 10)
    // The sidebar stays where it was.
    expect(width('Sidebar width')).toBe(260)
  })

  it('stops each column at its minimum width', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')

    for (let press = 0; press < 50; press++) {
      fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowLeft' })
      fireEvent.keyDown(boundary('Changes width'), { key: 'ArrowLeft' })
    }

    expect(width('Sidebar width')).toBe(180)
    expect(width('Changes width')).toBe(220)
    expect(boundary('Sidebar width').getAttribute('aria-valuemin')).toBe('180')
    expect(boundary('Changes width').getAttribute('aria-valuemin')).toBe('220')
  })

  it('resets a boundary to its default on double-click', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')
    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowRight' })
    fireEvent.keyDown(boundary('Changes width'), { key: 'ArrowRight' })

    fireEvent.doubleClick(boundary('Sidebar width'))

    expect(width('Sidebar width')).toBe(260)
    // Only the boundary that was double-clicked.
    expect(width('Changes width')).toBe(370)
  })

  it('exposes each boundary as a focusable, vertical separator', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')

    for (const name of ['Sidebar width', 'Changes width'] as const) {
      boundary(name).focus()
      expect(document.activeElement).toBe(boundary(name))
      expect(boundary(name).getAttribute('aria-orientation')).toBe('vertical')
    }
  })

  it('keeps the same widths in every tab, through switching back and forth', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha', '/repos/beta'] })
    await screen.findByText('alpha-main')
    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowRight' })
    fireEvent.keyDown(boundary('Changes width'), { key: 'ArrowLeft' })

    fireEvent.click(screen.getByRole('button', { name: 'beta' }))
    await screen.findByText('beta-main')
    expect(width('Sidebar width')).toBe(270)
    expect(width('Changes width')).toBe(350)

    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    await screen.findByText('alpha-main')
    expect(width('Sidebar width')).toBe(270)
    expect(width('Changes width')).toBe(350)
  })

  it('brings the widths back on the next launch', async () => {
    const first = renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')
    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowRight' })
    fireEvent.keyDown(boundary('Changes width'), { key: 'ArrowRight' })
    fireEvent.keyDown(boundary('Changes width'), { key: 'ArrowRight' })
    first.unmount()

    renderWithProviders(<App />)
    await screen.findByText('alpha-main')

    expect(width('Sidebar width')).toBe(270)
    expect(width('Changes width')).toBe(380)
  })

  it('remembers a reset as the default', async () => {
    const first = renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')
    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowRight' })
    fireEvent.doubleClick(boundary('Sidebar width'))
    first.unmount()

    renderWithProviders(<App />)
    await screen.findByText('alpha-main')

    expect(width('Sidebar width')).toBe(260)
  })

  it('starts unreadable widths at the default, and a saved one too narrow at the minimum', async () => {
    localStorage.setItem('branches.columnWidths', JSON.stringify({ sidebar: 'wide', changes: 4 }))
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')

    expect(width('Sidebar width')).toBe(260)
    expect(width('Changes width')).toBe(220)
  })

  it('falls back to the defaults, and still resizes, when localStorage throws', async () => {
    renderWithProviders(<App />, { tabs: ['/repos/alpha'] })
    await screen.findByText('alpha-main')
    cleanup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    renderWithProviders(<App />)
    // Tabs can't be read either, so this is the backdrop; open a repository to get columns.
    await choose('alpha')
    await screen.findByText('alpha-main')

    expect(width('Sidebar width')).toBe(260)
    expect(width('Changes width')).toBe(360)
    fireEvent.keyDown(boundary('Sidebar width'), { key: 'ArrowRight' })
    expect(width('Sidebar width')).toBe(270)
    vi.restoreAllMocks()
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

describe('Pull', () => {
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
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    api.pullRepository.mockReturnValue(promise)
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

const pushButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /^(Push|Publish)/ }) as HTMLButtonElement

/** Opens `alpha` in a focused tab with the given status, and waits for it to land. */
async function openWith(overrides: Partial<RepositoryStatus>): Promise<void> {
  api.getStatus.mockImplementation(async (root) =>
    status(`${root.split('/').pop()}-main`, overrides)
  )
  renderWithProviders(<App />)
  await choose('alpha')
  await waitFor(() => expect(api.getStatus).toHaveBeenCalledWith('/repos/alpha'))
  await waitFor(() => expect(api.getPublishTarget).toHaveBeenCalledWith('/repos/alpha'))
}

describe('Push', () => {
  it('is disabled on the backdrop, where there is no repository to push from', async () => {
    renderWithProviders(<App />)
    await screen.findByRole('option', { name: 'alpha' })

    expect(pushButton().textContent).toBe('Push')
    expect(pushButton().disabled).toBe(true)
  })

  it('says how far ahead the branch is', async () => {
    await openWith({ upstream: 'origin/main', ahead: 2 })

    await waitFor(() => expect(pushButton().disabled).toBe(false))
    expect(pushButton().textContent).toBe('Push2')
  })

  it('is disabled when the branch has nothing its upstream lacks', async () => {
    await openWith({ upstream: 'origin/main', ahead: 0, behind: 3 })
    await screen.findByText('alpha-main')

    expect(pushButton().textContent).toBe('Push')
    expect(pushButton().disabled).toBe(true)
  })

  it('is ready to push before it knows where else the branch could go', async () => {
    api.getPublishTarget.mockImplementation(() => new Promise<never>(() => {}))
    api.getStatus.mockImplementation(async (root) =>
      status(`${root.split('/').pop()}-main`, { upstream: 'origin/main', ahead: 2 })
    )
    renderWithProviders(<App />)
    await choose('alpha')

    await waitFor(() => expect(pushButton().disabled).toBe(false))
    expect(pushButton().textContent).toBe('Push2')
  })

  it('stays enabled for a diverged branch, showing how far ahead it is', async () => {
    await openWith({ upstream: 'origin/main', ahead: 1, behind: 2 })

    await waitFor(() => expect(pushButton().disabled).toBe(false))
    expect(pushButton().textContent).toBe('Push1')
  })

  it('is disabled on a detached HEAD', async () => {
    api.getPublishTarget.mockResolvedValue(publishTarget(null))
    await openWith({ branch: null, detached: true, upstream: 'origin/main', ahead: 2 })

    await waitFor(() => expect(pushButton().disabled).toBe(true))
    expect(pushButton().textContent).toBe('Push')
  })

  it('reads Publish when the branch has no upstream', async () => {
    await openWith({ upstream: null })

    await waitFor(() => expect(pushButton().textContent).toBe('Publish'))
    expect(pushButton().disabled).toBe(false)
  })

  it('reads Publish when the upstream is gone', async () => {
    api.getPublishTarget.mockResolvedValue(publishTarget('alpha-main', { goneFrom: 'origin' }))
    await openWith({ upstream: 'origin/alpha-main' })

    await waitFor(() => expect(pushButton().textContent).toBe('Publish'))
  })

  it('stays Push, enabled, with no remote at all — and says why it can’t', async () => {
    api.getPublishTarget.mockResolvedValue(publishTarget('alpha-main', { remotes: [] }))
    api.pushRepository.mockRejectedValue(
      new ApiError({ code: 'NO_REMOTE', message: 'This repository has no remote to push to.' })
    )
    await openWith({ upstream: null })
    await waitFor(() => expect(pushButton().disabled).toBe(false))
    expect(pushButton().textContent).toBe('Push')

    fireEvent.click(pushButton())

    expect((await screen.findByRole('alert')).textContent).toContain('no remote')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('pushes the focused tab’s repository and re-reads its branches', async () => {
    await openWith({ upstream: 'origin/main', ahead: 2 })
    await waitFor(() => expect(pushButton().disabled).toBe(false))
    const branchReads = api.listBranches.mock.calls.length

    fireEvent.click(pushButton())

    await waitFor(() => expect(api.pushRepository).toHaveBeenCalledWith('/repos/alpha'))
    await waitFor(() => expect(api.listBranches.mock.calls.length).toBeGreaterThan(branchReads))
  })

  it('reports a rejected push in the row', async () => {
    api.pushRepository.mockRejectedValue(
      new ApiError({
        code: 'PUSH_REJECTED',
        message: 'alpha-main is behind its upstream. Pull first, then push.'
      })
    )
    await openWith({ upstream: 'origin/main', ahead: 1 })
    await waitFor(() => expect(pushButton().disabled).toBe(false))

    fireEvent.click(pushButton())

    expect((await screen.findByRole('alert')).textContent).toContain('Pull first')
  })

  it('says it is working and cannot be fired twice at once', async () => {
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    api.pushRepository.mockReturnValue(promise)
    await openWith({ upstream: 'origin/main', ahead: 1 })
    await waitFor(() => expect(pushButton().disabled).toBe(false))

    fireEvent.click(pushButton())

    await waitFor(() => expect(pushButton().getAttribute('aria-busy')).toBe('true'))
    expect(pushButton().disabled).toBe(true)
    fireEvent.click(pushButton())
    expect(api.pushRepository).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish()
    })
  })
})

const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Publish Branch' })
const publishButton = (): HTMLButtonElement =>
  within(dialog()).getByRole('button', { name: 'Publish Branch' }) as HTMLButtonElement
const cancelButton = (): HTMLButtonElement =>
  within(dialog()).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement

/** Opens `alpha` with no upstream and the given publish target, then opens the dialog. */
async function openDialog(target: Partial<PublishTarget> = {}): Promise<void> {
  api.getPublishTarget.mockResolvedValue(publishTarget('alpha-main', target))
  renderWithProviders(<App />)
  await choose('alpha')
  const publish = await screen.findByRole('button', { name: 'Publish' })
  await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(publish)
  await screen.findByRole('dialog', { name: 'Publish Branch' })
}

/** Picks a remote from the dialog's Select. */
async function pickRemote(name: string): Promise<void> {
  fireEvent.click(within(dialog()).getByRole('combobox', { name: 'Remote' }))
  const option = await screen.findByRole('option', { name })
  fireEvent.pointerDown(option, { pointerType: 'mouse' })
  fireEvent.click(option)
}

describe('the Publish Branch dialog', () => {
  const twoRemotes = [
    { name: 'fork', url: 'git@example.com:fork/repo.git', hasBranch: true },
    { name: 'origin', url: 'git@example.com:me/repo.git', hasBranch: false }
  ]

  it('names the branch and the one remote, with its URL', async () => {
    await openDialog()

    expect(dialog().textContent).toContain(
      'Creates a new branch on the selected remote repository. The local branch will automatically push to and pull from the new remote branch.'
    )
    expect(dialog().textContent).toContain('alpha-main')
    expect(dialog().textContent).toContain('origin')
    expect(dialog().textContent).toContain('git@example.com:me/repo.git')
    expect(within(dialog()).queryByRole('combobox')).toBeNull()
  })

  it('publishes to the remote, closes and goes back to Push', async () => {
    await openDialog()
    api.getStatus.mockResolvedValue(status('alpha-main', { upstream: 'origin/alpha-main' }))
    api.getPublishTarget.mockResolvedValue(
      publishTarget('alpha-main', {
        remotes: [{ name: 'origin', url: 'git@example.com:me/repo.git', hasBranch: true }]
      })
    )

    fireEvent.click(publishButton())

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.publishBranch).toHaveBeenCalledWith('/repos/alpha', 'origin')
    const push = await screen.findByRole('button', { name: 'Push' })
    expect((push as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers several remotes in a Select, starting on origin', async () => {
    await openDialog({ remotes: twoRemotes })

    const select = within(dialog()).getByRole('combobox', { name: 'Remote' })
    expect(select.textContent).toContain('origin')
    expect(dialog().textContent).toContain('git@example.com:me/repo.git')
  })

  it('publishes to the remote the user picks, showing its URL', async () => {
    await openDialog({ remotes: twoRemotes })

    await pickRemote('fork')

    await waitFor(() => expect(dialog().textContent).toContain('git@example.com:fork/repo.git'))
    fireEvent.click(publishButton())
    await waitFor(() => expect(api.publishBranch).toHaveBeenCalledWith('/repos/alpha', 'fork'))
  })

  it('says when the chosen remote already has the branch, following the selection', async () => {
    await openDialog({ remotes: twoRemotes })
    expect(dialog().textContent).not.toContain('already has')

    await pickRemote('fork')

    await waitFor(() => expect(dialog().textContent).toContain('fork already has alpha-main'))
    expect(publishButton().disabled).toBe(false)
  })

  it('starts on the remote a gone upstream was on, and says it was deleted there', async () => {
    api.getStatus.mockImplementation(async () =>
      status('alpha-main', { upstream: 'fork/alpha-main' })
    )
    await openDialog({
      remotes: twoRemotes.map((remote) => ({ ...remote, hasBranch: false })),
      goneFrom: 'fork'
    })

    expect(within(dialog()).getByRole('combobox', { name: 'Remote' }).textContent).toContain('fork')
    expect(dialog().textContent).toContain(
      'alpha-main was deleted from fork. Publishing creates it again.'
    )
  })

  it('shows a failure inside the dialog, which stays open to retry', async () => {
    api.publishBranch.mockRejectedValueOnce(
      new ApiError({ code: 'COMMAND_FAILED', message: 'Permission denied (publickey).' })
    )
    await openDialog()

    fireEvent.click(publishButton())

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('Permission denied')
    fireEvent.click(publishButton())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.publishBranch).toHaveBeenCalledTimes(2)
  })

  it('stays open while publishing, with Publish Branch busy and Cancel disabled', async () => {
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    api.publishBranch.mockReturnValue(promise)
    await openDialog()

    fireEvent.click(publishButton())

    await waitFor(() => expect(publishButton().getAttribute('aria-busy')).toBe('true'))
    expect(cancelButton().disabled).toBe(true)
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeNull()

    await act(async () => {
      finish()
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on Cancel without publishing', async () => {
    await openDialog()

    fireEvent.click(cancelButton())

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.publishBranch).not.toHaveBeenCalled()
  })
})

const refreshButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement

describe('Refresh', () => {
  it('re-reads the focused tab’s repository without reaching the remote', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    await screen.findByText('beta-main')
    api.getStatus.mockClear()
    api.listBranches.mockClear()

    fireEvent.click(refreshButton())

    await waitFor(() => expect(api.getStatus).toHaveBeenCalledWith('/repos/beta'))
    await waitFor(() => expect(api.listBranches).toHaveBeenCalledWith('/repos/beta'))
    expect(api.getStatus).not.toHaveBeenCalledWith('/repos/alpha')
    expect(api.fetchRepository).not.toHaveBeenCalled()
    expect(api.pullRepository).not.toHaveBeenCalled()
  })
  it('says it is working, and keeps what is on screen until the new read lands', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')
    const statusRead = Promise.withResolvers<RepositoryStatus>()
    api.getStatus.mockReturnValue(statusRead.promise)

    fireEvent.click(refreshButton())

    await waitFor(() => expect(refreshButton().getAttribute('aria-busy')).toBe('true'))
    expect(refreshButton().disabled).toBe(true)
    // Stale data stays put: no skeleton, no pending state in its place.
    expect(screen.getByText('alpha-main')).toBeTruthy()
    expect(screen.queryByRole('status', { name: /loading/i })).toBeNull()

    await act(async () => {
      statusRead.resolve(status('alpha-next'))
    })
    expect(await screen.findByText('alpha-next')).toBeTruthy()
    await waitFor(() => expect(refreshButton().disabled).toBe(false))
    expect(refreshButton().getAttribute('aria-busy')).toBeNull()
  })
})

const bar = (): HTMLElement | null => screen.queryByRole('progressbar', { name: 'In progress' })

/** Lets `ms` of fake time pass, flushing the renders and promises it releases. */
async function elapse(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Makes the next status reads hang until the returned function is called. */
function slowStatus(): () => void {
  const pending: Array<() => void> = []
  api.getStatus.mockImplementation(
    (root) =>
      new Promise((resolve) => {
        pending.push(() => resolve(status(`${root.split('/').pop()}-main`)))
      })
  )
  return () => {
    for (const finish of pending.splice(0)) finish()
  }
}

describe('the in-progress bar', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('appears below the tab strip only once a refresh has taken about 400ms', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')
    const finish = slowStatus()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await elapse(350)
    expect(bar()).toBeNull()

    await elapse(100)
    expect(bar()).not.toBeNull()
    // Under the strip, above the columns: it spans the window.
    const strip = screen.getByRole('navigation', { name: 'Tabs' })
    expect(strip.compareDocumentPosition(bar() as HTMLElement)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(screen.getByText('alpha-main')).toBeTruthy()

    finish()
    await elapse(10)
    expect(bar()).toBeNull()
  })

  it('never flashes for a refresh that finishes quickly', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')
    const finish = slowStatus()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await elapse(200)
    finish()
    await elapse(1000)

    expect(bar()).toBeNull()
  })

  it('shows while a fetch of the focused repository is in flight', async () => {
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    api.fetchRepository.mockReturnValue(promise)
    renderWithProviders(<App />)
    await choose('alpha')
    await screen.findByText('alpha-main')
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }))
    await elapse(500)

    expect(bar()).not.toBeNull()
    finish()
    await elapse(10)
    expect(bar()).toBeNull()
  })

  it('reflects the focused tab only', async () => {
    renderWithProviders(<App />)
    await choose('alpha')
    newTab()
    await choose('beta')
    await screen.findByText('beta-main')
    const finish = slowStatus()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await elapse(500)
    expect(bar()).not.toBeNull()

    // beta's read is still in flight, but alpha is what is in front now.
    api.getStatus.mockImplementation(async (root) => status(`${root.split('/').pop()}-main`))
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    await elapse(500)
    expect(screen.getByText('alpha-main')).toBeTruthy()
    expect(bar()).toBeNull()

    finish()
    await elapse(10)
  })
})

describe('a repository’s first load', () => {
  it('shows the changes and branch columns as pending, not empty', async () => {
    const statusRead = Promise.withResolvers<RepositoryStatus>()
    const branchesRead = Promise.withResolvers<Branch[]>()
    api.getStatus.mockReturnValue(statusRead.promise)
    api.listBranches.mockReturnValue(branchesRead.promise)
    renderWithProviders(<App />)

    await choose('alpha')

    expect(await screen.findByRole('status', { name: 'Loading changes' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading branches' })).toBeTruthy()
    expect(screen.queryByText('No changes')).toBeNull()
    expect(screen.queryByText('No branches yet.')).toBeNull()

    await act(async () => {
      statusRead.resolve(status('alpha-main'))
      branchesRead.resolve([])
    })

    expect(await screen.findByText('No changes')).toBeTruthy()
    expect(screen.getByText('No branches yet.')).toBeTruthy()
    expect(screen.queryByRole('status', { name: /^Loading/ })).toBeNull()
  })

  it('shows a branch’s history as pending, not empty', async () => {
    api.listBranches.mockResolvedValue([mainBranch])
    const commitsRead = Promise.withResolvers<Commit[]>()
    api.listCommits.mockReturnValue(commitsRead.promise)
    renderWithProviders(<App />)
    await choose('alpha')

    fireEvent.click(await screen.findByRole('treeitem', { name: 'main' }))

    expect(await screen.findByRole('status', { name: 'Loading history' })).toBeTruthy()
    expect(screen.queryByText('No commits yet.')).toBeNull()

    await act(async () => {
      commitsRead.resolve([])
    })

    expect(await screen.findByText('No commits yet.')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Loading history' })).toBeNull()
  })
})

/* Fixtures and queries for the commit details tests below. */
const tip: Commit = {
  oid: 'a'.repeat(40),
  shortOid: 'aaaaaaaa',
  parents: ['b'.repeat(40)],
  subject: 'Refresh on demand',
  authorName: 'Ada Lovelace',
  authorDate: '2026-11-18T05:34:25-05:00'
}
const parent: Commit = {
  oid: 'b'.repeat(40),
  shortOid: 'bbbbbbbb',
  parents: [],
  subject: 'Initial commit',
  authorName: 'Ada Lovelace',
  authorDate: '2026-11-17T05:34:25-05:00'
}
const detailsOf = (commit: Commit, overrides: Partial<CommitDetails> = {}): CommitDetails => ({
  oid: commit.oid,
  authorName: commit.authorName,
  authorEmail: 'ada@example.com',
  authorDate: commit.authorDate,
  committerName: commit.authorName,
  committerEmail: 'ada@example.com',
  committerDate: commit.authorDate,
  description: '',
  ...overrides
})
const longDate = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'long' }).format(new Date(iso))

const option = (subject: string): Promise<HTMLElement> =>
  screen.findByRole('option', { name: new RegExp(subject) })

const pane = (): HTMLElement => screen.getByRole('region', { name: 'Commit details' })

/** Opens alpha and selects its main branch, so the history and commit details are showing. */
async function openHistory(commits: Commit[] = [tip, parent]): Promise<void> {
  api.listBranches.mockResolvedValue([mainBranch])
  api.listCommits.mockResolvedValue(commits)
  api.getCommitDetails.mockImplementation(async (_root, oid) =>
    detailsOf(commits.find((commit) => commit.oid === oid) ?? tip)
  )
  api.listCommitFiles.mockResolvedValue([])
  renderWithProviders(<App />)
  await choose('alpha')
  fireEvent.click(await screen.findByRole('treeitem', { name: 'main' }))
}

describe('commit details', () => {
  it('asks for a commit to be selected until one is', async () => {
    await openHistory()
    await option('Refresh on demand')

    expect(within(pane()).getByText('Select a commit to see its details')).toBeTruthy()
    expect(api.getCommitDetails).not.toHaveBeenCalled()
  })

  it('shows the subject, author, author date and commit ID of the selected commit', async () => {
    await openHistory()
    fireEvent.click(await option('Refresh on demand'))

    const details = pane()
    expect(within(details).getByRole('heading', { name: 'Refresh on demand' })).toBeTruthy()
    expect(await within(details).findByText('Ada Lovelace <ada@example.com>')).toBeTruthy()
    expect(within(details).getByText(longDate(tip.authorDate))).toBeTruthy()
    expect(within(details).getByText(tip.oid)).toBeTruthy()
    expect(api.getCommitDetails).toHaveBeenCalledWith('/repos/alpha', tip.oid)
  })

  it('leaves out the committer when it is the author, and the description when there is none', async () => {
    await openHistory()
    fireEvent.click(await option('Refresh on demand'))
    await within(pane()).findByText('Ada Lovelace <ada@example.com>')

    expect(within(pane()).queryByText('Committer')).toBeNull()
    expect(within(pane()).queryByText('Committer Date')).toBeNull()
    expect(within(pane()).getAllByRole('definition')).toHaveLength(3)
  })

  it('shows the committer when it differs, and the description with its line breaks', async () => {
    await openHistory()
    api.getCommitDetails.mockResolvedValue(
      detailsOf(tip, {
        committerName: 'GitHub',
        committerEmail: 'noreply@github.com',
        committerDate: '2026-11-18T06:00:00-05:00',
        description: 'First line.\n\nCo-Authored-By: B <b@example.com>'
      })
    )
    fireEvent.click(await option('Refresh on demand'))

    expect(await within(pane()).findByText('GitHub <noreply@github.com>')).toBeTruthy()
    expect(within(pane()).getByText(longDate('2026-11-18T06:00:00-05:00'))).toBeTruthy()
    const description = within(pane()).getByText(/First line\./)
    expect(description.textContent).toBe('First line.\n\nCo-Authored-By: B <b@example.com>')
  })

  it('switches the subject at once when arrowing, before the next commit\u2019s details land', async () => {
    await openHistory()
    fireEvent.click(await option('Refresh on demand'))
    await within(pane()).findByText(tip.oid)
    api.getCommitDetails.mockReturnValue(new Promise(() => {}))

    fireEvent.keyDown(await option('Refresh on demand'), { key: 'ArrowDown' })

    expect(within(pane()).getByRole('heading', { name: 'Initial commit' })).toBeTruthy()
    expect(within(pane()).queryByText(tip.oid)).toBeNull()
    expect((await option('Initial commit')).getAttribute('aria-selected')).toBe('true')
    expect((await option('Refresh on demand')).getAttribute('aria-selected')).toBe('false')
  })

  it('lists the files the selected commit changed below its details', async () => {
    await openHistory()
    api.listCommitFiles.mockResolvedValue([
      { kind: 'modified', path: 'src/App.tsx', originalPath: null }
    ])
    fireEvent.click(await option('Refresh on demand'))

    const row = await within(pane()).findByRole('button', { name: /src\/App\.tsx/ })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(api.listCommitFiles).toHaveBeenCalledWith('/repos/alpha', tip.oid)
  })

  it('says what went wrong when the details cannot be read', async () => {
    await openHistory()
    api.getCommitDetails.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'fatal: bad object' })
    )
    fireEvent.click(await option('Refresh on demand'))

    expect((await within(pane()).findByRole('alert')).textContent).toContain('bad object')
  })

  it('drops the selection silently when a refresh no longer lists the commit', async () => {
    await openHistory()
    fireEvent.click(await option('Refresh on demand'))
    await within(pane()).findByText(tip.oid)

    api.listCommits.mockResolvedValue([parent])
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    expect(await within(pane()).findByText('Select a commit to see its details')).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Refresh on demand/ })).toBeNull()

    // Dropped, not just hidden: the commit coming back doesn't bring the selection with it.
    api.listCommits.mockResolvedValue([tip, parent])
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect((await option('Refresh on demand')).getAttribute('aria-selected')).toBe('false')
    expect(within(pane()).getByText('Select a commit to see its details')).toBeTruthy()
  })

  it('keeps the selected commit through a tab switch and back', async () => {
    await openHistory()
    fireEvent.click(await option('Refresh on demand'))
    await within(pane()).findByText(tip.oid)

    newTab()
    await choose('beta')
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))

    expect(await within(pane()).findByText(tip.oid)).toBeTruthy()
  })

  it('gives the history list its own boundary, separate from the changes list\u2019s', async () => {
    await openHistory()
    await option('Refresh on demand')
    const history = screen.getByRole('separator', { name: 'History width' })
    expect(history.getAttribute('aria-valuenow')).toBe('500')
    expect(history.getAttribute('aria-valuemin')).toBe('320')

    fireEvent.keyDown(history, { key: 'ArrowLeft' })
    expect(history.getAttribute('aria-valuenow')).toBe('490')

    fireEvent.click(screen.getByRole('button', { name: /working/i }))
    expect(
      (await screen.findByRole('separator', { name: 'Changes width' })).getAttribute(
        'aria-valuenow'
      )
    ).toBe('360')
  })
})

// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { RepositoryStatus, SavedRepository } from '../../../shared/git'
import type { RendererApi } from '../api'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  openRepository: vi.fn<RendererApi['openRepository']>(),
  listRepositories: vi.fn<RendererApi['listRepositories']>(),
  removeRepository: vi.fn<RendererApi['removeRepository']>(),
  showRepositoryMenu: vi.fn<RendererApi['showRepositoryMenu']>(),
  confirmRemoveMissingRepository: vi.fn<RendererApi['confirmRemoveMissingRepository']>(),
  getStatus: vi.fn<RendererApi['getStatus']>(),
  listBranches: vi.fn<RendererApi['listBranches']>(),
  onOpenRepositoryRequested: vi.fn<RendererApi['onOpenRepositoryRequested']>()
}))
vi.mock('../api', () => ({ api }))

import { Sidebar } from './Sidebar'

const repo = (name: string, missing = false): SavedRepository => ({
  root: `/repos/${name}`,
  name,
  lastOpenedAt: '2026-11-14T00:00:00.000Z',
  missing
})

const status = (): RepositoryStatus => ({
  branch: 'main',
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: []
})

/** The options, reopening the list first if it has collapsed behind the active repository. */
async function showList(): Promise<HTMLElement[]> {
  await waitFor(() =>
    expect(
      screen.queryAllByRole('option').length +
        screen.queryAllByRole('button', { expanded: false }).length
    ).toBeGreaterThan(0)
  )
  const header = screen.queryByRole('button', { expanded: false })
  if (header) fireEvent.click(header)
  return screen.findAllByRole('option')
}

/** Moves focus the way a keyboard user does, which is what opens a tooltip on focus. */
async function focusWithKeyboard(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'Tab' })
    element.focus()
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.onOpenRepositoryRequested.mockReturnValue(() => {})
  api.getStatus.mockResolvedValue(status())
  api.listBranches.mockResolvedValue([])
})

afterEach(cleanup)

describe('empty state', () => {
  it('explains there are no repositories and offers to open one', async () => {
    api.listRepositories.mockResolvedValue([])
    api.openRepository.mockResolvedValue(null)
    renderWithProviders(<Sidebar />)

    expect(await screen.findByText(/no repositories yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open repository…' }))

    await waitFor(() => expect(api.openRepository).toHaveBeenCalledOnce())
  })
})

describe('repository list', () => {
  it('lists saved repositories by name, none selected at first', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)

    const options = await screen.findAllByRole('option')

    expect(options.map((option) => option.textContent)).toEqual(['alpha', 'beta'])
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'false'
    ])
  })

  it('makes a repository active when it is clicked', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)

    fireEvent.click(await screen.findByRole('option', { name: 'beta' }))

    // The list folds away behind the active repository; reopening shows who is selected.
    expect(screen.getByRole('button', { name: /beta/ })).toBeTruthy()
    await showList()
    expect(screen.getByRole('option', { name: 'beta' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'alpha' }).getAttribute('aria-selected')).toBe(
      'false'
    )
  })

  it('reopens the repository that was active last launch, with the list folded away', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)

    const header = await screen.findByRole('button', { name: /alpha/ })

    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
    const [alpha] = await showList()
    expect(alpha.getAttribute('aria-selected')).toBe('true')
  })

  it('makes a repository opened from the button active and folds the list away', async () => {
    api.listRepositories.mockResolvedValueOnce([repo('alpha')])
    api.openRepository.mockResolvedValue('/repos/beta')
    renderWithProviders(<Sidebar />)
    await screen.findByRole('option', { name: 'alpha' })

    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    fireEvent.click(screen.getByRole('button', { name: 'Open repository…' }))

    const header = await screen.findByRole('button', { name: /beta/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

async function listWithThree(): Promise<HTMLElement[]> {
  api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta'), repo('gamma')])
  renderWithProviders(<Sidebar />)
  return showList()
}

describe('keyboard', () => {
  it('is one tab stop: the first option, until one is active', async () => {
    const options = await listWithThree()

    expect(options.map((option) => option.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('is one tab stop: the active option', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/beta')
    const options = await listWithThree()

    expect(options.map((option) => option.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('moves focus with the arrow keys, stopping at the ends, without selecting', async () => {
    const [alpha, beta, gamma] = await listWithThree()
    alpha.focus()

    fireEvent.keyDown(alpha, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(beta)

    fireEvent.keyDown(beta, { key: 'ArrowDown' })
    fireEvent.keyDown(gamma, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(gamma)

    fireEvent.keyDown(gamma, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(beta)

    for (const option of [alpha, beta, gamma]) {
      expect(option.getAttribute('aria-selected')).toBe('false')
    }
  })

  it('selects the focused option with Enter', async () => {
    const [alpha, beta] = await listWithThree()
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowDown' })

    fireEvent.keyDown(beta, { key: 'Enter' })

    expect(screen.getByRole('button', { name: /beta/ })).toBeTruthy()
  })
})

describe('missing repositories', () => {
  it('shows them dimmed with a folder-x icon, and still lists them', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    renderWithProviders(<Sidebar />)

    const gone = await screen.findByRole('option', { name: 'gone' })
    const alpha = screen.getByRole('option', { name: 'alpha' })

    expect(gone.getAttribute('data-missing')).toBe('true')
    expect(gone.querySelector('.lucide-folder-x')).not.toBeNull()
    expect(alpha.getAttribute('data-missing')).toBeNull()
    expect(alpha.querySelector('.lucide-folder-x')).toBeNull()
  })

  it('explains in a tooltip, on focus, how to remove one', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    renderWithProviders(<Sidebar />)
    const gone = await screen.findByRole('option', { name: 'gone' })

    await focusWithKeyboard(gone)

    expect(
      await screen.findByText(/gone can.t be found\. Click to remove it from the list\./)
    ).toBeTruthy()
  })

  it('has no tooltip on a repository that is there', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    renderWithProviders(<Sidebar />)
    const alpha = await screen.findByRole('option', { name: 'alpha' })

    await focusWithKeyboard(alpha)

    expect(screen.queryByText(/can.t be found/)).toBeNull()
  })

  it('offers to remove one when it is clicked, instead of making it active', async () => {
    api.listRepositories.mockResolvedValue([repo('gone', true)])
    api.confirmRemoveMissingRepository.mockResolvedValue(false)
    renderWithProviders(<Sidebar />)

    fireEvent.click(await screen.findByRole('option', { name: 'gone' }))

    await waitFor(() =>
      expect(api.confirmRemoveMissingRepository).toHaveBeenCalledWith('/repos/gone')
    )
    expect(screen.getByRole('option', { name: 'gone' }).getAttribute('aria-selected')).toBe('false')
  })

  it('offers the same from the keyboard', async () => {
    api.listRepositories.mockResolvedValue([repo('gone', true)])
    api.confirmRemoveMissingRepository.mockResolvedValue(false)
    renderWithProviders(<Sidebar />)

    fireEvent.keyDown(await screen.findByRole('option', { name: 'gone' }), { key: 'Enter' })

    await waitFor(() => expect(api.confirmRemoveMissingRepository).toHaveBeenCalledOnce())
  })

  it('refreshes the list once the user confirms, and keeps it when they cancel', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    api.confirmRemoveMissingRepository.mockResolvedValueOnce(false)
    renderWithProviders(<Sidebar />)
    const gone = await screen.findByRole('option', { name: 'gone' })

    fireEvent.click(gone)
    await waitFor(() => expect(api.confirmRemoveMissingRepository).toHaveBeenCalledOnce())
    expect(api.listRepositories).toHaveBeenCalledTimes(1)

    api.confirmRemoveMissingRepository.mockResolvedValueOnce(true)
    api.listRepositories.mockResolvedValue([repo('alpha')])
    fireEvent.click(gone)

    await waitFor(() => expect(screen.queryByRole('option', { name: 'gone' })).toBeNull())
    expect(screen.getByRole('option', { name: 'alpha' })).toBeTruthy()
  })

  it('clears the active repository when it is the one removed', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/gone')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    api.confirmRemoveMissingRepository.mockResolvedValue(true)
    renderWithProviders(<Sidebar />)
    await showList()
    const gone = screen.getByRole('option', { name: 'gone' })
    expect(gone.getAttribute('aria-selected')).toBe('true')

    api.listRepositories.mockResolvedValue([repo('alpha')])
    fireEvent.click(gone)

    await waitFor(() => expect(screen.queryByRole('option', { name: 'gone' })).toBeNull())
    expect(localStorage.getItem('branches.activeRoot')).toBeNull()
  })
})

describe('context menu', () => {
  it('opens the native menu for the repository that was right-clicked', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.showRepositoryMenu.mockResolvedValue(false)
    renderWithProviders(<Sidebar />)

    fireEvent.contextMenu(await screen.findByRole('option', { name: 'beta' }))

    await waitFor(() => expect(api.showRepositoryMenu).toHaveBeenCalledWith('/repos/beta'))
    expect(api.listRepositories).toHaveBeenCalledTimes(1)
  })

  it('refreshes the list after Remove from List, and clears the active repository', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/beta')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.showRepositoryMenu.mockResolvedValue(true)
    renderWithProviders(<Sidebar />)
    await showList()
    const beta = screen.getByRole('option', { name: 'beta' })

    api.listRepositories.mockResolvedValue([repo('alpha')])
    fireEvent.contextMenu(beta)

    await waitFor(() => expect(screen.queryByRole('option', { name: 'beta' })).toBeNull())
    expect(localStorage.getItem('branches.activeRoot')).toBeNull()
    expect(screen.getByRole('option', { name: 'alpha' }).getAttribute('aria-selected')).toBe(
      'false'
    )
  })
})

describe('Open Repository… menu command', () => {
  it('opens a repository when main asks, and stops listening on unmount', async () => {
    const unsubscribe = vi.fn<() => void>()
    const listeners: Array<() => void> = []
    api.onOpenRepositoryRequested.mockImplementation((listener) => {
      listeners.push(listener)
      return unsubscribe
    })
    api.listRepositories.mockResolvedValue([repo('alpha')])
    api.openRepository.mockResolvedValue(null)
    const { unmount } = renderWithProviders(<Sidebar />)
    await screen.findByRole('option', { name: 'alpha' })

    listeners[0]()
    await waitFor(() => expect(api.openRepository).toHaveBeenCalledOnce())

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('errors', () => {
  it('shows why a repository could not be opened', async () => {
    api.listRepositories.mockResolvedValue([])
    api.openRepository.mockRejectedValue(
      new ApiError({ code: 'NOT_A_REPOSITORY', message: 'That folder is not a git repository.' })
    )
    renderWithProviders(<Sidebar />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open repository…' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That folder is not a git repository.'
    )
  })
})

describe('collapsible repository list', () => {
  it('stays open while no repository is active, with no header', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)

    expect(await screen.findAllByRole('option')).toHaveLength(2)
    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
    expect(screen.queryByRole('button', { expanded: true })).toBeNull()
  })

  it('folds into a header naming the active repository when one is chosen', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)

    fireEvent.click(await screen.findByRole('option', { name: 'alpha' }))

    const header = screen.getByRole('button', { name: /alpha/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('reopens from the header, and folds again when the header is clicked again', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)
    const header = await screen.findByRole('button', { name: /alpha/ })

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('option')).toHaveLength(2)

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('switches repository from the reopened list and folds away again', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)
    fireEvent.click(await screen.findByRole('button', { name: /alpha/ }))

    fireEvent.click(screen.getByRole('option', { name: 'beta' }))

    const header = screen.getByRole('button', { name: /beta/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('folds away when the already-active repository is chosen again', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Sidebar />)
    fireEvent.click(await screen.findByRole('button', { name: /alpha/ }))

    fireEvent.click(screen.getByRole('option', { name: 'alpha' }))

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('folds away when Open repository… picks the repository that is already active', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.openRepository.mockResolvedValue('/repos/alpha')
    renderWithProviders(<Sidebar />)
    fireEvent.click(await screen.findByRole('button', { name: /alpha/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Open repository…' }))

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('folds away when Cmd+O picks the repository that is already active', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    const listeners: Array<() => void> = []
    api.onOpenRepositoryRequested.mockImplementation((listener) => {
      listeners.push(listener)
      return () => {}
    })
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.openRepository.mockResolvedValue('/repos/alpha')
    renderWithProviders(<Sidebar />)
    fireEvent.click(await screen.findByRole('button', { name: /alpha/ }))

    listeners[0]()

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('stays open when the folder picker is cancelled', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.openRepository.mockResolvedValue(null)
    renderWithProviders(<Sidebar />)
    fireEvent.click(await screen.findByRole('button', { name: /alpha/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Open repository…' }))

    await waitFor(() => expect(api.openRepository).toHaveBeenCalledOnce())
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('opens the list again when the active repository is removed from it', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/beta')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.showRepositoryMenu.mockResolvedValue(true)
    renderWithProviders(<Sidebar />)
    await showList()

    api.listRepositories.mockResolvedValue([repo('alpha')])
    fireEvent.contextMenu(screen.getByRole('option', { name: 'beta' }))

    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
  })

  it('shows a missing active repository as missing in the header', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/gone')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    renderWithProviders(<Sidebar />)

    const header = await screen.findByRole('button', { name: /gone/ })

    expect(header.getAttribute('data-missing')).toBe('true')
    expect(header.querySelector('.lucide-folder-x')).not.toBeNull()

    await focusWithKeyboard(header)
    expect(await screen.findByText(/gone can.t be found/)).toBeTruthy()
  })

  it('lists the repositories rather than a header when the remembered one is not saved', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/unknown')
    api.listRepositories.mockResolvedValue([repo('alpha')])
    renderWithProviders(<Sidebar />)

    expect(await screen.findByRole('option', { name: 'alpha' })).toBeTruthy()
    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
  })
})

describe('branch tree', () => {
  it('shows the active repository’s branches below the list', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/alpha')
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.listBranches.mockResolvedValue([
      {
        name: 'feature/login',
        isCurrent: true,
        shortOid: 'abc1234',
        upstream: null,
        upstreamGone: false,
        ahead: 0,
        behind: 0
      }
    ])
    renderWithProviders(<Sidebar />)

    expect(await screen.findByRole('treeitem', { name: 'feature/login' })).toBeTruthy()
    expect(api.listBranches).toHaveBeenCalledWith('/repos/alpha')
  })

  it('shows no tree while no repository is active', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha')])
    renderWithProviders(<Sidebar />)
    await screen.findByRole('option', { name: 'alpha' })

    expect(screen.queryByRole('tree')).toBeNull()
    expect(api.listBranches).not.toHaveBeenCalled()
  })

  it('shows no tree, and asks git nothing, for a missing active repository', async () => {
    localStorage.setItem('branches.activeRoot', '/repos/gone')
    api.listRepositories.mockResolvedValue([repo('gone', true)])
    renderWithProviders(<Sidebar />)
    await screen.findByRole('button', { name: /gone/ })

    expect(screen.queryByRole('tree')).toBeNull()
    expect(api.listBranches).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { SavedRepository } from '../../../shared/git'
import type { RendererApi } from '../api'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  openRepository: vi.fn<RendererApi['openRepository']>(),
  listRepositories: vi.fn<RendererApi['listRepositories']>(),
  removeRepository: vi.fn<RendererApi['removeRepository']>(),
  showRepositoryMenu: vi.fn<RendererApi['showRepositoryMenu']>(),
  confirmRemoveMissingRepository: vi.fn<RendererApi['confirmRemoveMissingRepository']>(),
  onOpenRepositoryRequested: vi.fn<RendererApi['onOpenRepositoryRequested']>()
}))
vi.mock('../api', () => ({ api }))

import { useOpenRepository } from '../data'
import { Repositories } from './Repositories'

/** The surface with the open-a-repository command App owns for it. */
function Surface(): React.JSX.Element {
  const open = useOpenRepository()
  return <Repositories onOpenRepository={open.mutate} openError={open.error} />
}

const repo = (name: string, missing = false): SavedRepository => ({
  root: `/repos/${name}`,
  name,
  lastOpenedAt: '2026-11-14T00:00:00.000Z',
  missing
})

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
})

afterEach(cleanup)

describe('the saved list', () => {
  it('lists saved repositories by name, none of them open yet', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    renderWithProviders(<Surface />)

    const options = await screen.findAllByRole('option')

    expect(options.map((option) => option.textContent)).toEqual(['alpha', 'beta'])
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'false'
    ])
  })

  it('says when there are none, and still offers to open one', async () => {
    api.listRepositories.mockResolvedValue([])
    api.openRepository.mockResolvedValue(null)
    renderWithProviders(<Surface />)

    expect(await screen.findByText(/no repositories yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Repository…' }))

    await waitFor(() => expect(api.openRepository).toHaveBeenCalledOnce())
  })
})

async function listWithThree(): Promise<HTMLElement[]> {
  api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta'), repo('gamma')])
  renderWithProviders(<Surface />)
  return screen.findAllByRole('option')
}

describe('keyboard', () => {
  it('is one tab stop: the first option', async () => {
    const options = await listWithThree()

    expect(options.map((option) => option.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('moves focus with the arrow keys, stopping at the ends, without choosing', async () => {
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

  it('keeps the tab stop on the option focused last', async () => {
    const [, beta] = await listWithThree()

    await focusWithKeyboard(beta)

    expect(screen.getAllByRole('option').map((option) => option.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      '-1'
    ])
  })
})

describe('missing repositories', () => {
  it('shows them dimmed with a folder-x icon, and still lists them', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    renderWithProviders(<Surface />)

    const gone = await screen.findByRole('option', { name: 'gone' })
    const alpha = screen.getByRole('option', { name: 'alpha' })

    expect(gone.getAttribute('data-missing')).toBe('true')
    expect(gone.querySelector('.lucide-folder-x')).not.toBeNull()
    expect(alpha.getAttribute('data-missing')).toBeNull()
    expect(alpha.querySelector('.lucide-folder-x')).toBeNull()
  })

  it('explains in a tooltip, on focus, how to remove one', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    renderWithProviders(<Surface />)
    const gone = await screen.findByRole('option', { name: 'gone' })

    await focusWithKeyboard(gone)

    expect(
      await screen.findByText(/gone can.t be found\. Click to remove it from the list\./)
    ).toBeTruthy()
  })

  it('has no tooltip on a repository that is there', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    renderWithProviders(<Surface />)
    const alpha = await screen.findByRole('option', { name: 'alpha' })

    await focusWithKeyboard(alpha)

    expect(screen.queryByText(/can.t be found/)).toBeNull()
  })

  it('offers to remove one when it is clicked, instead of opening it', async () => {
    api.listRepositories.mockResolvedValue([repo('gone', true)])
    api.confirmRemoveMissingRepository.mockResolvedValue(false)
    renderWithProviders(<Surface />)

    fireEvent.click(await screen.findByRole('option', { name: 'gone' }))

    await waitFor(() =>
      expect(api.confirmRemoveMissingRepository).toHaveBeenCalledWith('/repos/gone')
    )
    expect(screen.getByRole('option', { name: 'gone' }).getAttribute('aria-selected')).toBe('false')
  })

  it('offers the same from the keyboard', async () => {
    api.listRepositories.mockResolvedValue([repo('gone', true)])
    api.confirmRemoveMissingRepository.mockResolvedValue(false)
    renderWithProviders(<Surface />)

    fireEvent.keyDown(await screen.findByRole('option', { name: 'gone' }), { key: 'Enter' })

    await waitFor(() => expect(api.confirmRemoveMissingRepository).toHaveBeenCalledOnce())
  })

  it('refreshes the list once the user confirms, and keeps it when they cancel', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('gone', true)])
    api.confirmRemoveMissingRepository.mockResolvedValueOnce(false)
    renderWithProviders(<Surface />)
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
})

describe('context menu', () => {
  it('opens the native menu for the repository that was right-clicked', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.showRepositoryMenu.mockResolvedValue(false)
    renderWithProviders(<Surface />)

    fireEvent.contextMenu(await screen.findByRole('option', { name: 'beta' }))

    await waitFor(() => expect(api.showRepositoryMenu).toHaveBeenCalledWith('/repos/beta'))
    expect(api.listRepositories).toHaveBeenCalledTimes(1)
  })

  it('refreshes the list after Remove from List', async () => {
    api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta')])
    api.showRepositoryMenu.mockResolvedValue(true)
    renderWithProviders(<Surface />)
    const beta = await screen.findByRole('option', { name: 'beta' })

    api.listRepositories.mockResolvedValue([repo('alpha')])
    fireEvent.contextMenu(beta)

    await waitFor(() => expect(screen.queryByRole('option', { name: 'beta' })).toBeNull())
    expect(screen.getByRole('option', { name: 'alpha' })).toBeTruthy()
  })
})

describe('errors', () => {
  it('shows why a repository could not be opened', async () => {
    api.listRepositories.mockResolvedValue([])
    api.openRepository.mockRejectedValue(
      new ApiError({ code: 'NOT_A_REPOSITORY', message: 'That folder is not a git repository.' })
    )
    renderWithProviders(<Surface />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open Repository…' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That folder is not a git repository.'
    )
  })
})

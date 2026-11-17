// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryStatus, SavedRepository } from '../../shared/git'
import type { RendererApi } from './api'
import { renderWithProviders } from './data/testUtils'

const api = vi.hoisted(() => ({
  openRepository: vi.fn<RendererApi['openRepository']>(),
  listRepositories: vi.fn<RendererApi['listRepositories']>(),
  getStatus: vi.fn<RendererApi['getStatus']>(),
  listBranches: vi.fn<RendererApi['listBranches']>(),
  setActiveRepository: vi.fn<RendererApi['setActiveRepository']>(),
  onOpenRepositoryRequested: vi.fn<RendererApi['onOpenRepositoryRequested']>(),
  onRemoteRefsChanged: vi.fn<RendererApi['onRemoteRefsChanged']>()
}))
vi.mock('./api', () => ({ api }))

import App from './App'

const repo = (name: string): SavedRepository => ({
  root: `/repos/${name}`,
  name,
  lastOpenedAt: '2026-11-14T00:00:00.000Z',
  missing: false
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

/** Picks a repository from the sidebar, reopening the list if it has folded away. */
async function choose(name: string): Promise<void> {
  const header = screen.queryByRole('button', { expanded: false })
  if (header) fireEvent.click(header)
  fireEvent.click(await screen.findByRole('option', { name }))
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.onOpenRepositoryRequested.mockReturnValue(() => {})
  api.onRemoteRefsChanged.mockReturnValue(() => {})
  api.setActiveRepository.mockResolvedValue(undefined)
  api.listBranches.mockResolvedValue([])
  api.listRepositories.mockResolvedValue([repo('alpha'), repo('beta'), repo('gamma')])
  api.getStatus.mockImplementation(async (root) => status(`${root.split('/').pop()}-main`))
})

afterEach(cleanup)

describe('switching repositories', () => {
  it('shows one changes pane and one diff pane, for the repository now active', async () => {
    renderWithProviders(<App />)

    await choose('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()
    await choose('beta')
    expect(await screen.findByText('beta-main')).toBeTruthy()
    await choose('gamma')
    expect(await screen.findByText('gamma-main')).toBeTruthy()
    await choose('alpha')
    expect(await screen.findByText('alpha-main')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getAllByText('No changes')).toHaveLength(1)
      expect(screen.getAllByText('Select a file to see its changes')).toHaveLength(1)
    })
    expect(screen.getAllByText('alpha-main')).toHaveLength(1)
    expect(screen.queryByText('beta-main')).toBeNull()
    expect(screen.queryByText('gamma-main')).toBeNull()
  })
})

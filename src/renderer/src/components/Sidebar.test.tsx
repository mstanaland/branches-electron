// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileChange, RepositoryStatus } from '../../../shared/git'
import type { RendererApi } from '../api'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  getStatus: vi.fn<RendererApi['getStatus']>(),
  listBranches: vi.fn<RendererApi['listBranches']>(),
  listMergedBranches: vi.fn<RendererApi['listMergedBranches']>()
}))
vi.mock('../api', () => ({ api }))

import { Sidebar } from './Sidebar'

const status = (): RepositoryStatus => ({
  branch: 'main',
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: []
})

const change = (path: string): FileChange => ({
  path,
  originalPath: null,
  index: null,
  worktree: 'modified',
  kind: 'ordinary'
})

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.getStatus.mockResolvedValue(status())
  api.listBranches.mockResolvedValue([])
  api.listMergedBranches.mockResolvedValue([])
})

afterEach(cleanup)

describe('the view switcher', () => {
  it('is Working and the branch tree, with no repository list above them', async () => {
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
    renderWithProviders(<Sidebar root="/repos/alpha" />)

    expect(await screen.findByRole('treeitem', { name: 'feature/login' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /working/i })).toBeTruthy()
    expect(api.listBranches).toHaveBeenCalledWith('/repos/alpha')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /open repository/i })).toBeNull()
  })
})

describe('the Working view', () => {
  it('is selected to begin with', () => {
    renderWithProviders(<Sidebar root="/repos/alpha" />)

    expect(screen.getByRole('button', { name: /working/i }).getAttribute('aria-current')).toBe(
      'true'
    )
  })

  it('counts every change, whatever its staging state', async () => {
    api.getStatus.mockResolvedValue({
      ...status(),
      changes: [change('a.txt'), change('b.txt'), change('c.txt')]
    })
    renderWithProviders(<Sidebar root="/repos/alpha" />)

    expect(await screen.findByLabelText('3 changes')).toBeTruthy()
  })

  it('says "change" for one', async () => {
    api.getStatus.mockResolvedValue({ ...status(), changes: [change('a.txt')] })
    renderWithProviders(<Sidebar root="/repos/alpha" />)

    expect(await screen.findByLabelText('1 change')).toBeTruthy()
  })

  it('shows no count at all when the repository is clean', async () => {
    renderWithProviders(<Sidebar root="/repos/alpha" />)

    const working = await screen.findByRole('button', { name: /working/i })
    expect(working.textContent).toBe('Working')
  })
})

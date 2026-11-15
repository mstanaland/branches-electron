// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Branch, RepositoryStatus } from '../../../shared/git'
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

import { BranchTree } from './BranchTree'

const ROOT = '/repos/alpha'

const branch = (name: string, overrides: Partial<Branch> = {}): Branch => ({
  name,
  isCurrent: false,
  shortOid: 'abc1234',
  upstream: null,
  upstreamGone: false,
  ahead: 0,
  behind: 0,
  ...overrides
})

const status = (overrides: Partial<RepositoryStatus> = {}): RepositoryStatus => ({
  branch: 'main',
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [],
  ...overrides
})

function showBranches(
  branches: Branch[],
  repositoryStatus = status(),
  root = ROOT
): ReturnType<typeof renderWithProviders> {
  api.getStatus.mockResolvedValue(repositoryStatus)
  api.listBranches.mockResolvedValue(branches)
  return renderWithProviders(<BranchTree root={root} />)
}

/** Each tree item as [accessible name, nesting level]. */
function outline(): Array<[string | null, string | null]> {
  return screen
    .getAllByRole('treeitem')
    .map((item) => [item.getAttribute('aria-label'), item.getAttribute('aria-level')])
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('nesting', () => {
  it('shows branches as a tree, with "/" names in folders, expanded to start', async () => {
    showBranches([
      branch('main', { isCurrent: true }),
      branch('feature/login'),
      branch('feature/ui/header')
    ])

    await screen.findByRole('tree', { name: 'Branches' })

    expect(outline()).toEqual([
      ['main', '1'],
      ['feature', '1'],
      ['feature/login', '2'],
      ['feature/ui', '2'],
      ['feature/ui/header', '3']
    ])
    expect(screen.getByRole('treeitem', { name: 'feature' }).getAttribute('aria-expanded')).toBe(
      'true'
    )
  })

  it('gives branches no aria-expanded, because only folders expand', async () => {
    showBranches([branch('main'), branch('feature/login')])

    const main = await screen.findByRole('treeitem', { name: 'main' })

    expect(main.getAttribute('aria-expanded')).toBeNull()
  })

  it('says so when there are no branches yet', async () => {
    showBranches([])

    expect(await screen.findByText(/no branches yet/i)).toBeTruthy()
    expect(screen.queryByRole('tree')).toBeNull()
  })
})

describe('markers', () => {
  it('marks only the current branch', async () => {
    showBranches([branch('main', { isCurrent: true }), branch('dev')])

    const main = await screen.findByRole('treeitem', { name: 'main' })
    const dev = screen.getByRole('treeitem', { name: 'dev' })

    expect(main.getAttribute('aria-current')).toBe('true')
    expect(dev.getAttribute('aria-current')).toBeNull()
  })

  it('shows ahead and behind counts only when non-zero', async () => {
    showBranches([
      branch('both', { ahead: 2, behind: 1 }),
      branch('only-ahead', { ahead: 3 }),
      branch('only-behind', { behind: 4 }),
      branch('level')
    ])
    await screen.findByRole('tree')

    expect(screen.getByRole('img', { name: '2 ahead, 1 behind' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '3 ahead' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '4 behind' })).toBeTruthy()
    const level = screen.getByRole('treeitem', { name: 'level' })
    expect(within(level).queryByRole('img')).toBeNull()
  })

  it('marks a branch whose upstream was deleted', async () => {
    showBranches([branch('old', { upstream: 'origin/old', upstreamGone: true }), branch('main')])
    await screen.findByRole('tree')

    const old = screen.getByRole('treeitem', { name: 'old' })

    expect(within(old).getByRole('img', { name: 'Upstream gone' })).toBeTruthy()
    expect(within(screen.getByRole('treeitem', { name: 'main' })).queryByRole('img')).toBeNull()
  })

  it('describes a branch by its markers, so screen readers hear them', async () => {
    showBranches([branch('old', { ahead: 1, upstreamGone: true })])

    const old = await screen.findByRole('treeitem', { name: 'old' })

    expect(old.getAttribute('aria-describedby')).toBeTruthy()
    const description = document.getElementById(old.getAttribute('aria-describedby') ?? '')
    expect(description?.textContent).toMatch(/1 ahead/)
    expect(description?.textContent).toMatch(/Upstream gone/)
  })
})

const FEATURES = [
  branch('main'),
  branch('feature/login'),
  branch('feature/ui/header'),
  branch('fix/typo')
]

const collapseFeature = (): void => {
  fireEvent.click(screen.getByText('feature'))
}

describe('collapsing folders', () => {
  it("hides a folder's branches when it is clicked, and shows them again on the next click", async () => {
    showBranches(FEATURES)
    await screen.findByRole('tree')

    collapseFeature()

    const feature = screen.getByRole('treeitem', { name: 'feature' })
    expect(feature.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('treeitem', { name: 'feature/login' })).toBeNull()
    expect(screen.getByRole('treeitem', { name: 'fix' })).toBeTruthy()

    collapseFeature()

    expect(feature.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('treeitem', { name: 'feature/login' })).toBeTruthy()
  })

  it('flags a collapsed folder that contains the current branch', async () => {
    showBranches([
      branch('main'),
      branch('feature/ui/header', { isCurrent: true }),
      branch('fix/typo')
    ])
    await screen.findByRole('tree')
    const flag = { name: 'Contains current branch' }

    expect(screen.queryByRole('img', flag)).toBeNull()

    collapseFeature()
    fireEvent.click(screen.getByText('fix'))

    // Only the folder holding the current branch is flagged, not its siblings.
    const feature = screen.getByRole('treeitem', { name: 'feature' })
    expect(within(feature).getByRole('img', flag)).toBeTruthy()
    expect(
      within(screen.getByRole('treeitem', { name: 'fix' })).queryByRole('img', flag)
    ).toBeNull()
    expect(screen.getAllByRole('img', flag)).toHaveLength(1)
  })

  it('flags only the outermost collapsed folder', async () => {
    showBranches([branch('a/b/c', { isCurrent: true })])
    await screen.findByRole('tree')

    fireEvent.click(screen.getByText('a'))

    expect(screen.getAllByRole('img', { name: 'Contains current branch' })).toHaveLength(1)
  })
})

describe('remembering collapsed folders', () => {
  it('keeps a folder collapsed when the tree is shown again', async () => {
    const first = showBranches(FEATURES)
    await screen.findByRole('tree')
    collapseFeature()
    first.unmount()

    showBranches(FEATURES)

    const feature = await screen.findByRole('treeitem', { name: 'feature' })
    expect(feature.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('treeitem', { name: 'feature/login' })).toBeNull()
  })

  it('remembers each repository separately', async () => {
    const first = showBranches(FEATURES, status(), '/repos/alpha')
    await screen.findByRole('tree')
    collapseFeature()
    first.unmount()

    showBranches(FEATURES, status(), '/repos/beta')

    const feature = await screen.findByRole('treeitem', { name: 'feature' })
    expect(feature.getAttribute('aria-expanded')).toBe('true')
  })

  it('follows the repository when the same tree switches to another one', async () => {
    api.getStatus.mockResolvedValue(status())
    api.listBranches.mockResolvedValue(FEATURES)
    localStorage.setItem('branches.collapsedFolders./repos/alpha', JSON.stringify(['feature']))
    const { rerender } = renderWithProviders(<BranchTree root="/repos/alpha" />)
    expect(
      (await screen.findByRole('treeitem', { name: 'feature' })).getAttribute('aria-expanded')
    ).toBe('false')

    rerender(<BranchTree root="/repos/beta" />)

    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'feature' }).getAttribute('aria-expanded')).toBe(
        'true'
      )
    )
  })

  it('still collapses and expands when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    showBranches(FEATURES)
    await screen.findByRole('tree')

    collapseFeature()

    expect(screen.getByRole('treeitem', { name: 'feature' }).getAttribute('aria-expanded')).toBe(
      'false'
    )
  })

  it('ignores corrupt saved state', async () => {
    localStorage.setItem('branches.collapsedFolders./repos/alpha', '{not json')
    showBranches(FEATURES)

    const feature = await screen.findByRole('treeitem', { name: 'feature' })

    expect(feature.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('detached HEAD', () => {
  it('shows "Detached at <short oid>" above the tree', async () => {
    showBranches(
      [branch('main'), branch('dev')],
      status({ branch: null, detached: true, headOid: '9f3a2c1' })
    )

    const row = await screen.findByText('Detached at 9f3a2c1')
    const tree = await screen.findByRole('tree')

    expect(row.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      screen.queryAllByRole('treeitem').some((item) => item.getAttribute('aria-current'))
    ).toBe(false)
  })

  it('does not show it when a branch is checked out', async () => {
    showBranches([branch('main', { isCurrent: true })])
    await screen.findByRole('tree')

    expect(screen.queryByText(/detached at/i)).toBeNull()
  })
})

const item = (name: string): HTMLElement => screen.getByRole('treeitem', { name })
const press = (name: string, key: string): void => {
  fireEvent.keyDown(item(name), { key })
}

async function showTree(): Promise<void> {
  showBranches(FEATURES)
  await screen.findByRole('tree')
}

describe('keyboard', () => {
  it('is a single tab stop, on the first item until one has been focused', async () => {
    await showTree()

    const stops = screen.getAllByRole('treeitem').filter((i) => i.getAttribute('tabindex') === '0')

    expect(stops.map((i) => i.getAttribute('aria-label'))).toEqual(['main'])
  })

  it('moves through the visible items with Down and Up, including into open folders', async () => {
    await showTree()
    item('main').focus()

    press('main', 'ArrowDown')
    expect(document.activeElement).toBe(item('feature'))

    press('feature', 'ArrowDown')
    expect(document.activeElement).toBe(item('feature/login'))

    press('feature/login', 'ArrowUp')
    expect(document.activeElement).toBe(item('feature'))
  })

  it('skips the contents of collapsed folders, and stops at the ends', async () => {
    await showTree()
    collapseFeature()
    fireEvent.click(screen.getByText('fix'))
    item('main').focus()

    press('main', 'ArrowUp')
    expect(document.activeElement).toBe(item('main'))

    press('main', 'ArrowDown')
    press('feature', 'ArrowDown')
    expect(document.activeElement).toBe(item('fix'))

    press('fix', 'ArrowDown')
    expect(document.activeElement).toBe(item('fix'))
  })

  it('makes the focused item the tab stop', async () => {
    await showTree()
    item('main').focus()
    press('main', 'ArrowDown')

    expect(item('feature').getAttribute('tabindex')).toBe('0')
    expect(item('main').getAttribute('tabindex')).toBe('-1')
  })

  it('expands a collapsed folder with Right, then moves into it with Right again', async () => {
    await showTree()
    collapseFeature()
    item('feature').focus()

    press('feature', 'ArrowRight')
    expect(item('feature').getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(item('feature'))

    press('feature', 'ArrowRight')
    expect(document.activeElement).toBe(item('feature/login'))
  })

  it('collapses an open folder with Left', async () => {
    await showTree()
    item('feature').focus()

    press('feature', 'ArrowLeft')

    expect(item('feature').getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(item('feature'))
  })

  it('moves from a branch to its folder with Left, without collapsing the folder', async () => {
    await showTree()
    item('feature/ui/header').focus()

    press('feature/ui/header', 'ArrowLeft')
    expect(document.activeElement).toBe(item('feature/ui'))

    press('feature/ui', 'ArrowLeft')
    expect(item('feature/ui').getAttribute('aria-expanded')).toBe('false')
    expect(item('feature').getAttribute('aria-expanded')).toBe('true')
  })

  it('does nothing for Left on a top-level branch or Right on any branch', async () => {
    await showTree()
    item('main').focus()

    press('main', 'ArrowLeft')
    press('main', 'ArrowRight')

    expect(document.activeElement).toBe(item('main'))
  })

  it('toggles a folder with Enter or Space', async () => {
    await showTree()
    item('feature').focus()

    press('feature', 'Enter')
    expect(item('feature').getAttribute('aria-expanded')).toBe('false')

    press('feature', ' ')
    expect(item('feature').getAttribute('aria-expanded')).toBe('true')
  })
})

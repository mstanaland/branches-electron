// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { Branch, BranchDeletion, RepositoryStatus } from '../../../shared/git'
import type { MergedBranch } from '../../../shared/github'
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
  listMergedBranches: vi.fn<RendererApi['listMergedBranches']>(),
  checkoutBranch: vi.fn<RendererApi['checkoutBranch']>(),
  createBranch: vi.fn<RendererApi['createBranch']>(),
  showBranchMenu: vi.fn<RendererApi['showBranchMenu']>(),
  getBranchDeletion: vi.fn<RendererApi['getBranchDeletion']>(),
  deleteBranch: vi.fn<RendererApi['deleteBranch']>(),
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
  checkedOutElsewhere: false,
  ahead: 0,
  behind: 0,
  ...overrides
})

const mergedBy = (name: string, number: number): MergedBranch => ({
  name,
  pullRequest: {
    number,
    title: `Pull request ${number}`,
    url: `https://github.com/octo/hello/pull/${number}`,
    baseBranch: 'main',
    mergedAt: '2026-11-01T10:00:00Z'
  }
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
  return renderWithProviders(<BranchTree root={root} />, { tabs: [root] })
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
  api.listMergedBranches.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openCreateDialog(): Promise<HTMLElement> {
  api.showBranchMenu.mockResolvedValue('create')
  showBranches([branch('main', { isCurrent: true }), branch('source')])
  fireEvent.contextMenu(await screen.findByRole('treeitem', { name: 'source' }))
  return screen.findByRole('dialog', { name: 'Create New Branch' })
}

describe('creating a branch', () => {
  it('shows the source, creates and checks out the named branch, and selects its history', async () => {
    const dialog = await openCreateDialog()
    expect(within(dialog).getByText('From “source”')).toBeTruthy()
    const input = within(dialog).getByRole('textbox', { name: 'New branch name' })
    const submit = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Create and Check Out'
    })
    expect(submit.disabled).toBe(true)
    api.createBranch.mockImplementation(async () => {
      api.getStatus.mockResolvedValue(status({ branch: 'feature/new' }))
      api.listBranches.mockResolvedValue([
        branch('main'),
        branch('source'),
        branch('feature/new', { isCurrent: true })
      ])
    })

    fireEvent.change(input, { target: { value: 'feature/new' } })
    fireEvent.click(submit)

    await waitFor(() =>
      expect(api.createBranch).toHaveBeenCalledWith(ROOT, 'source', 'feature/new')
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const created = screen.getByRole('treeitem', { name: 'feature/new' })
    expect(created.getAttribute('aria-current')).toBe('true')
    expect(created.getAttribute('aria-selected')).toBe('true')
  })

  it('shows the files blocking checkout and preserves the name for a retry', async () => {
    const dialog = await openCreateDialog()
    api.createBranch.mockRejectedValueOnce(
      new ApiError({
        code: 'CHECKOUT_BLOCKED_BY_CHANGES',
        message: 'Checkout blocked',
        files: ['notes.txt']
      })
    )
    const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'New branch name' })
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and Check Out' }))

    const blocked = await screen.findByRole('dialog', { name: 'Can’t switch to new' })
    expect(within(blocked).getByText('notes.txt')).toBeTruthy()
    fireEvent.click(within(blocked).getByRole('button', { name: 'OK' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Can’t switch to new' })).toBeNull()
    )
    expect(input.value).toBe('new')
  })
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

  it('marks a merged branch MERGED, in place of Upstream gone', async () => {
    api.listMergedBranches.mockResolvedValue([mergedBy('done', 12)])
    showBranches([
      branch('done', { upstream: 'origin/done', upstreamGone: true }),
      branch('abandoned', { upstream: 'origin/abandoned', upstreamGone: true }),
      branch('main')
    ])
    const done = await screen.findByRole('treeitem', { name: 'done' })

    const badge = await within(done).findByRole('img', { name: 'Merged by pull request #12' })
    expect(badge.textContent).toBe('MERGED')
    expect(within(done).queryByRole('img', { name: 'Upstream gone' })).toBeNull()
    const abandoned = screen.getByRole('treeitem', { name: 'abandoned' })
    expect(within(abandoned).getByRole('img', { name: 'Upstream gone' })).toBeTruthy()
    expect(within(abandoned).queryByRole('img', { name: /Merged/ })).toBeNull()
  })

  it('marks a merged branch whose upstream still exists', async () => {
    api.listMergedBranches.mockResolvedValue([mergedBy('done', 3)])
    showBranches([branch('done', { upstream: 'origin/done' }), branch('main')])
    const done = await screen.findByRole('treeitem', { name: 'done' })

    expect(await within(done).findByRole('img', { name: 'Merged by pull request #3' })).toBeTruthy()
    const description = document.getElementById(done.getAttribute('aria-describedby') ?? '')
    expect(description?.textContent).toBe('Merged by pull request #3')
  })

  it('asks for the merged branches of its own repository', async () => {
    showBranches([branch('main')])
    await screen.findByRole('tree')

    expect(api.listMergedBranches).toHaveBeenCalledWith(ROOT)
  })

  it('shows the tree as usual when the merged branches can’t be read', async () => {
    api.listMergedBranches.mockRejectedValue(new ApiError({ code: 'COMMAND_FAILED', message: 'x' }))
    showBranches([branch('old', { upstream: 'origin/old', upstreamGone: true }), branch('main')])
    const old = await screen.findByRole('treeitem', { name: 'old' })

    expect(within(old).getByRole('img', { name: 'Upstream gone' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
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
    const flag = { name: 'Contains the current branch' }

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

    expect(screen.getAllByRole('img', { name: 'Contains the current branch' })).toHaveLength(1)
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
    const { rerender } = renderWithProviders(<BranchTree root="/repos/alpha" />, {
      tabs: ['/repos/alpha']
    })
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
  const DETACHED_OID = '9f3a2c1d4e5f60718293a4b5c6d7e8f901234567'

  const detached = (): RepositoryStatus =>
    status({ branch: null, detached: true, headOid: DETACHED_OID })

  it('lists HEAD as the first item, labelled with the short oid', async () => {
    showBranches([branch('main'), branch('dev')], detached())
    await screen.findByRole('tree')

    expect(outline()[0]).toEqual(['Detached HEAD at 9f3a2c1d', '1'])
    expect(screen.getByText('9f3a2c1d')).toBeTruthy()
  })

  it('marks it as where HEAD is, and no branch as current', async () => {
    showBranches([branch('main'), branch('dev')], detached())
    const head = await screen.findByRole('treeitem', { name: 'Detached HEAD at 9f3a2c1d' })

    expect(head.getAttribute('aria-current')).toBe('true')
    expect(
      screen
        .getAllByRole('treeitem')
        .filter((candidate) => candidate.getAttribute('aria-current') === 'true')
    ).toHaveLength(1)
  })

  it('selects it when clicked, and shows nothing to check out', async () => {
    showBranches([branch('main')], detached())
    const head = await screen.findByRole('treeitem', { name: 'Detached HEAD at 9f3a2c1d' })

    fireEvent.click(head)
    expect(head.getAttribute('aria-selected')).toBe('true')

    fireEvent.doubleClick(head)
    fireEvent.contextMenu(head)
    expect(api.checkoutBranch).not.toHaveBeenCalled()
    expect(api.showBranchMenu).not.toHaveBeenCalled()
  })

  it('is not there when a branch is checked out', async () => {
    showBranches([branch('main', { isCurrent: true })])
    await screen.findByRole('tree')

    expect(screen.queryByRole('treeitem', { name: /detached head/i })).toBeNull()
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

const twoBranches = (): Branch[] => [branch('main', { isCurrent: true }), branch('work')]

/** The branch row's own element, which is what the user double-clicks. */
const row = (name: string): HTMLElement => screen.getByRole('treeitem', { name })

describe('checking out', () => {
  it('checks out a branch on double-click, then refreshes status and branches', async () => {
    showBranches(twoBranches())
    api.checkoutBranch.mockResolvedValue(undefined)
    await screen.findByRole('tree')
    const statusCalls = api.getStatus.mock.calls.length
    const branchCalls = api.listBranches.mock.calls.length

    fireEvent.doubleClick(row('work'))

    await waitFor(() => expect(api.checkoutBranch).toHaveBeenCalledWith(ROOT, 'work'))
    await waitFor(() => {
      expect(api.getStatus.mock.calls.length).toBeGreaterThan(statusCalls)
      expect(api.listBranches.mock.calls.length).toBeGreaterThan(branchCalls)
    })
  })

  it('selects rather than checks out when Enter or Space is pressed', async () => {
    // Selecting is what a click does, and the keyboard matches it: checking out is the
    // consequential act and keeps its own gesture (ADR 0006).
    showBranches(twoBranches())
    await screen.findByRole('tree')

    for (const key of ['Enter', ' ']) {
      row('work').focus()
      fireEvent.keyDown(row('work'), { key })

      expect(row('work').getAttribute('aria-selected')).toBe('true')
      expect(api.checkoutBranch).not.toHaveBeenCalled()
    }
  })

  it('does nothing when the current branch is double-clicked', async () => {
    showBranches(twoBranches())
    await screen.findByRole('tree')

    fireEvent.doubleClick(row('main'))

    expect(api.checkoutBranch).not.toHaveBeenCalled()
  })

  it('does not check out anything when a folder is double-clicked', async () => {
    showBranches([branch('main', { isCurrent: true }), branch('feature/login')])
    api.checkoutBranch.mockResolvedValue(undefined)
    await screen.findByRole('tree')

    fireEvent.doubleClick(row('feature'))

    expect(api.checkoutBranch).not.toHaveBeenCalled()
  })

  it('shows progress on the row being checked out, and ignores another double-click meanwhile', async () => {
    showBranches([...twoBranches(), branch('other')])
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    api.checkoutBranch.mockReturnValue(promise)
    await screen.findByRole('tree')

    fireEvent.doubleClick(row('work'))

    await waitFor(() => expect(row('work').getAttribute('aria-busy')).toBe('true'))
    expect(within(row('work')).getByRole('img', { name: 'Checking out' })).toBeTruthy()
    expect(row('other').getAttribute('aria-busy')).toBeNull()

    fireEvent.doubleClick(row('other'))
    expect(api.checkoutBranch).toHaveBeenCalledTimes(1)

    await act(async () => finish())
    await waitFor(() => expect(row('work').getAttribute('aria-busy')).toBeNull())
  })

  it('lists the files in a dialog when local changes block the checkout', async () => {
    showBranches(twoBranches())
    api.checkoutBranch.mockRejectedValue(
      new ApiError({
        code: 'CHECKOUT_BLOCKED_BY_CHANGES',
        message: 'blocked',
        files: ['README.md', 'my docs/a b.txt']
      })
    )
    await screen.findByRole('tree')

    fireEvent.doubleClick(row('work'))

    const dialog = await screen.findByRole('dialog', { name: /can’t switch to work/i })
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((entry) => entry.textContent)
    ).toEqual(['README.md', 'my docs/a b.txt'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /stash|discard/i })).toBeNull()
  })

  it('closes the blocked dialog, and the user can try again', async () => {
    showBranches(twoBranches())
    api.checkoutBranch.mockRejectedValueOnce(
      new ApiError({ code: 'CHECKOUT_BLOCKED_BY_CHANGES', message: 'blocked', files: ['a.txt'] })
    )
    api.checkoutBranch.mockResolvedValueOnce(undefined)
    await screen.findByRole('tree')

    fireEvent.doubleClick(row('work'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.doubleClick(row('work'))
    await waitFor(() => expect(api.checkoutBranch).toHaveBeenCalledTimes(2))
  })

  it('shows any other failure as an alert', async () => {
    showBranches(twoBranches())
    api.checkoutBranch.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git switch failed: boom' })
    )
    await screen.findByRole('tree')

    fireEvent.doubleClick(row('work'))

    expect((await screen.findByRole('alert')).textContent).toContain('boom')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('branch context menu', () => {
  it('opens the native menu for the right-clicked branch', async () => {
    showBranches(twoBranches())
    api.showBranchMenu.mockResolvedValue(null)
    await screen.findByRole('tree')

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'work' }))

    await waitFor(() => expect(api.showBranchMenu).toHaveBeenCalledWith(ROOT, 'work'))
    expect(api.checkoutBranch).not.toHaveBeenCalled()
  })

  it('checks out the branch when the user chooses "Check out"', async () => {
    showBranches(twoBranches())
    api.showBranchMenu.mockResolvedValue('checkout')
    api.checkoutBranch.mockResolvedValue(undefined)
    await screen.findByRole('tree')

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'work' }))

    await waitFor(() => expect(api.checkoutBranch).toHaveBeenCalledWith(ROOT, 'work'))
  })

  it('has no menu on a folder', async () => {
    showBranches([branch('main', { isCurrent: true }), branch('feature/login')])
    await screen.findByRole('tree')

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'feature' }))

    expect(api.showBranchMenu).not.toHaveBeenCalled()
  })
})

describe('deleting a branch', () => {
  const OID = 'a'.repeat(40)
  const deletion = (overrides: Partial<BranchDeletion> = {}): BranchDeletion => ({
    name: 'work',
    oid: OID,
    branchOnlyCommits: 0,
    goneUpstream: null,
    deletableUpstream: null,
    ...overrides
  })
  const UPSTREAM_OID = 'b'.repeat(40)
  const withUpstream = (branchOnlyCommits: number, upstreamCount: number): BranchDeletion =>
    deletion({
      name: 'work',
      branchOnlyCommits,
      deletableUpstream: {
        name: 'origin/bar',
        remote: 'origin',
        oid: UPSTREAM_OID,
        branchOnlyCommits: upstreamCount
      }
    })

  /** Right-clicks `work`, chooses Delete, and waits for the dialog to finish reading. */
  async function openDeleteDialog(read: BranchDeletion = deletion()): Promise<HTMLElement> {
    api.showBranchMenu.mockResolvedValue('delete')
    api.getBranchDeletion.mockResolvedValue(read)
    await screen.findByRole('tree')
    fireEvent.contextMenu(row('work'))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Branch' })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete Branch' })).toHaveProperty(
        'disabled',
        false
      )
    )
    return dialog
  }

  it('asks first, with Cancel focused so Return never deletes', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog()

    expect(api.getBranchDeletion).toHaveBeenCalledWith(ROOT, 'work')
    expect(dialog.textContent).toContain(
      'Deleting this branch “work” will remove it from your repository.'
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))
    )
    expect(
      within(dialog).getByRole('button', { name: 'Delete Branch' }).getAttribute('data-variant')
    ).toBe('danger')
    expect(api.deleteBranch).not.toHaveBeenCalled()
  })

  it('warns about nothing when the branch has no branch-only commits', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog()

    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(dialog.textContent).not.toContain('lost')
  })

  it('warns that branch-only commits will be lost', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog(deletion({ branchOnlyCommits: 3 }))

    expect(within(dialog).getByRole('alert').textContent).toBe(
      '3 commits on this branch aren’t on any other branch or remote, and will be lost.'
    )
  })

  it('says one commit in the singular', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog(deletion({ branchOnlyCommits: 1 }))

    expect(within(dialog).getByRole('alert').textContent).toBe(
      '1 commit on this branch isn’t on any other branch or remote, and will be lost.'
    )
  })

  it('notes calmly, without an alert, when the upstream is gone', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog(
      deletion({
        branchOnlyCommits: 3,
        goneUpstream: { name: 'origin/work', remote: 'origin' }
      })
    )

    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(dialog.textContent).toContain(
      'origin/work was deleted from origin. This branch’s 3 commits aren’t on any other branch — if it was merged with a squash or rebase they’re already in; anything committed after that will be lost.'
    )
  })

  it('offers no upstream to delete when the branch has none that may be', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog()

    expect(within(dialog).queryByRole('checkbox')).toBeNull()
  })

  it('offers to delete the upstream by its real name, unticked', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog(withUpstream(0, 0))

    const box = within(dialog).getByRole('checkbox', {
      name: 'Also delete “origin/bar” from origin'
    })
    expect(box.getAttribute('aria-checked')).toBe('false')
  })

  it('warns, live, about commits only the upstream kept once it is ticked', async () => {
    showBranches(twoBranches())
    const dialog = await openDeleteDialog(withUpstream(0, 2))
    expect(within(dialog).queryByRole('alert')).toBeNull()

    const box = within(dialog).getByRole('checkbox')
    fireEvent.click(box)

    expect(within(dialog).getByRole('alert').textContent).toBe(
      '2 commits on this branch aren’t on any other branch or remote, and will be lost.'
    )
    fireEvent.click(box)
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('deletes the upstream too, at the oid it read, when ticked', async () => {
    showBranches(twoBranches())
    api.deleteBranch.mockResolvedValue(undefined)
    const dialog = await openDeleteDialog(withUpstream(0, 0))

    fireEvent.click(within(dialog).getByText('Also delete “origin/bar” from origin'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Branch' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.deleteBranch).toHaveBeenCalledWith(ROOT, 'work', OID, UPSTREAM_OID)
  })

  it('shows a remote’s refusal inside the dialog, for a retry or unticking', async () => {
    showBranches(twoBranches())
    api.deleteBranch.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git push failed: bar is protected' })
    )
    const dialog = await openDeleteDialog(withUpstream(0, 0))
    const box = within(dialog).getByRole('checkbox')
    fireEvent.click(box)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Branch' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'git push failed: bar is protected'
    )
    fireEvent.click(box)
    expect(box.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('dialog', { name: 'Delete Branch' })).toBeTruthy()
  })

  it('deletes the branch at the oid it read, closes, and falls back to Working', async () => {
    const { client } = showBranches(twoBranches())
    api.deleteBranch.mockImplementation(async () => {
      api.listBranches.mockResolvedValue([branch('main', { isCurrent: true })])
    })
    await screen.findByRole('tree')
    fireEvent.click(row('work'))
    const dialog = await openDeleteDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Branch' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.deleteBranch).toHaveBeenCalledWith(ROOT, 'work', OID, null)
    await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'work' })).toBeNull())
    expect(row('main').getAttribute('aria-selected')).toBe('false')
    expect(client.isMutating()).toBe(0)
  })

  it('re-reads the merged branches once a merged branch is deleted', async () => {
    api.listMergedBranches.mockResolvedValue([mergedBy('work', 4)])
    showBranches([
      branch('main', { isCurrent: true }),
      branch('work', { upstream: 'origin/work', upstreamGone: true })
    ])
    api.deleteBranch.mockImplementation(async () => {
      api.listBranches.mockResolvedValue([branch('main', { isCurrent: true })])
      api.listMergedBranches.mockResolvedValue([])
    })
    const work = await screen.findByRole('treeitem', { name: 'work' })
    await within(work).findByRole('img', { name: 'Merged by pull request #4' })
    const dialog = await openDeleteDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Branch' }))

    await waitFor(() => expect(api.listMergedBranches).toHaveBeenCalledTimes(2))
  })

  it('can’t be dismissed while the delete runs', async () => {
    showBranches(twoBranches())
    api.deleteBranch.mockReturnValue(new Promise(() => {}))
    const dialog = await openDeleteDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Branch' }))
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveProperty(
        'disabled',
        true
      )
    )
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.getByRole('dialog', { name: 'Delete Branch' })).toBeTruthy()
  })

  it('shows a failure inside the dialog, which stays open', async () => {
    showBranches(twoBranches())
    api.deleteBranch.mockRejectedValue(
      new ApiError({
        code: 'BRANCH_MOVED',
        message: 'This branch has changed since you opened this. Close and try again.'
      })
    )
    const dialog = await openDeleteDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Branch' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'This branch has changed since you opened this. Close and try again.'
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(row('work')).toBeTruthy()
  })
})

describe('selecting a view', () => {
  it('selects the branch that was clicked, without checking anything out', async () => {
    showBranches(twoBranches())
    await screen.findByRole('tree')

    fireEvent.click(row('work'))

    expect(row('work').getAttribute('aria-selected')).toBe('true')
    expect(row('main').getAttribute('aria-selected')).toBe('false')
    expect(api.checkoutBranch).not.toHaveBeenCalled()
  })

  it('selects the branch it checks out, so the pane follows the switch', async () => {
    showBranches(twoBranches())
    api.checkoutBranch.mockResolvedValue(undefined)
    await screen.findByRole('tree')

    fireEvent.doubleClick(row('work'))

    await waitFor(() => expect(api.checkoutBranch).toHaveBeenCalledWith(ROOT, 'work'))
    expect(row('work').getAttribute('aria-selected')).toBe('true')
  })

  it('falls back to Working when the selected branch is gone', async () => {
    const { client } = showBranches(twoBranches())
    await screen.findByRole('tree')
    fireEvent.click(row('work'))
    expect(row('work').getAttribute('aria-selected')).toBe('true')

    // Deleted in a terminal, noticed on the next read of the branch list.
    api.listBranches.mockResolvedValue([branch('main', { isCurrent: true })])
    await act(async () => {
      await client.invalidateQueries()
    })

    await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'work' })).toBeNull())
    expect(row('main').getAttribute('aria-selected')).toBe('false')
  })

  it('keeps the selection while the branch is still listed', async () => {
    const { client } = showBranches(twoBranches())
    await screen.findByRole('tree')
    fireEvent.click(row('work'))

    await act(async () => {
      await client.invalidateQueries()
    })

    expect(row('work').getAttribute('aria-selected')).toBe('true')
  })
})

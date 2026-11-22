// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Branch } from '../../../shared/git'
import type { MergedBranch } from '../../../shared/github'
import type { RendererApi } from '../api'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  listCommits: vi.fn<RendererApi['listCommits']>(),
  listUnpushedCommits: vi.fn<RendererApi['listUnpushedCommits']>(),
  listBranches: vi.fn<RendererApi['listBranches']>(),
  listMergedBranches: vi.fn<RendererApi['listMergedBranches']>(),
  openExternal: vi.fn<RendererApi['openExternal']>(),
  getBranchDeletion: vi.fn<RendererApi['getBranchDeletion']>(),
  deleteBranch: vi.fn<RendererApi['deleteBranch']>()
}))
vi.mock('../api', () => ({ api }))

import { useSelection } from '../data'
import { CommitHistory } from './CommitHistory'

const ROOT = '/repos/alpha'
const OID = 'a'.repeat(40)
const NOW = new Date('2026-11-21T12:00:00Z')

function branch(name: string, overrides: Partial<Branch> = {}): Branch {
  return {
    name,
    isCurrent: false,
    shortOid: 'abc12345',
    upstream: null,
    upstreamGone: false,
    checkedOutElsewhere: false,
    ahead: 0,
    behind: 0,
    ...overrides
  }
}

const mergedFeature: MergedBranch = {
  name: 'feature',
  pullRequest: {
    number: 42,
    title: 'Add the login form',
    url: 'https://github.com/octo/hello/pull/42',
    baseBranch: 'main',
    mergedAt: '2026-11-18T12:00:00Z',
    headOid: 'a'.repeat(40)
  }
}

/** Shows what the History view's selected branch sees, so a fallback can be checked. */
function ViewProbe(): React.JSX.Element {
  const { view, setView } = useSelection()
  return (
    <>
      <output aria-label="view">{view.kind === 'branch' ? view.name : view.kind}</output>
      <button type="button" onClick={() => setView({ kind: 'branch', name: 'feature' })}>
        Select feature
      </button>
    </>
  )
}

function show(
  commitRef: string,
  branches: Branch[] = [branch('main'), branch('feature')],
  merged: MergedBranch[] = [mergedFeature]
): void {
  api.listCommits.mockResolvedValue([])
  api.listUnpushedCommits.mockResolvedValue([])
  api.listBranches.mockResolvedValue(branches)
  api.listMergedBranches.mockResolvedValue(merged)
  renderWithProviders(
    <>
      <CommitHistory root={ROOT} commitRef={commitRef} />
      <ViewProbe />
    </>,
    { tabs: [ROOT] }
  )
}

function isDisabled(button: HTMLElement): boolean {
  return button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true'
}

const alert = (): Promise<HTMLElement> => screen.findByRole('note', { name: 'Merged branch' })

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  // Only Date: the queries and waitFor still need real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the merged branch alert', () => {
  it('says which pull request merged the branch, into what, and when', async () => {
    show('feature')

    const note = await alert()
    expect(note.textContent).toContain('Merged into main by #42')
    expect(within(note).getByText('Add the login form')).toBeTruthy()
    // The locale's own words for it, whatever locale the test machine is in.
    const threeDaysAgo = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
      -3,
      'day'
    )
    expect(note.textContent).toContain(threeDaysAgo)
  })

  it('is absent for a branch no pull request merged', async () => {
    show('main')

    await waitFor(() => expect(api.listMergedBranches).toHaveBeenCalled())
    await screen.findByText('No commits yet.')
    expect(screen.queryByRole('note', { name: 'Merged branch' })).toBeNull()
  })

  it('opens the pull request on GitHub', async () => {
    api.openExternal.mockResolvedValue(undefined)
    show('feature')

    fireEvent.click(within(await alert()).getByRole('button', { name: 'View on GitHub' }))

    await waitFor(() =>
      expect(api.openExternal).toHaveBeenCalledWith(ROOT, mergedFeature.pullRequest.url)
    )
  })

  it('can’t be dismissed', async () => {
    show('feature')

    const buttons = within(await alert()).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['View on GitHub', 'Delete'])
  })

  it('deletes the branch through the Delete Branch dialog, then falls back to Working', async () => {
    api.getBranchDeletion.mockResolvedValue({
      name: 'feature',
      oid: OID,
      branchOnlyCommits: 0,
      goneUpstream: null,
      deletableUpstream: null,
      mergedBy: null
    })
    api.deleteBranch.mockResolvedValue(undefined)
    show('feature')
    // Select the branch, as the sidebar would have.
    fireEvent.click(screen.getByRole('button', { name: 'Select feature' }))
    expect(screen.getByRole('status', { name: 'view' }).textContent).toBe('feature')
    fireEvent.click(within(await alert()).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete Branch' })
    expect(api.getBranchDeletion).toHaveBeenCalledWith(ROOT, 'feature')
    const confirm = within(dialog).getByRole('button', { name: 'Delete Branch' })
    await waitFor(() => expect(isDisabled(confirm)).toBe(false))
    fireEvent.click(confirm)

    await waitFor(() => expect(api.deleteBranch).toHaveBeenCalledWith(ROOT, 'feature', OID, null))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('status', { name: 'view' }).textContent).toBe('working')
  })

  it('opens the Delete Branch dialog with the merged note, not the danger alert', async () => {
    api.getBranchDeletion.mockResolvedValue({
      name: 'feature',
      oid: OID,
      branchOnlyCommits: 2,
      goneUpstream: null,
      deletableUpstream: null,
      mergedBy: mergedFeature.pullRequest
    })
    show('feature')
    fireEvent.click(within(await alert()).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete Branch' })
    await waitFor(() => expect(dialog.textContent).toContain('Merged into main by #42.'))
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('disables Delete on the current branch, and says why', async () => {
    show('feature', [branch('main'), branch('feature', { isCurrent: true })])

    const note = await alert()
    const remove = await within(note).findByRole('button', {
      name: 'Delete',
      description: 'Switch to another branch to delete it'
    })
    expect(isDisabled(remove)).toBe(true)
  })

  it('disables Delete on a branch checked out in another work tree, and says why', async () => {
    show('feature', [branch('main'), branch('feature', { checkedOutElsewhere: true })])

    const note = await alert()
    const remove = await within(note).findByRole('button', {
      name: 'Delete',
      description: 'Switch its work tree to another branch to delete it'
    })
    expect(isDisabled(remove)).toBe(true)
  })

  it('leaves Delete enabled on any other merged branch', async () => {
    show('feature')

    const remove = within(await alert()).getByRole('button', { name: 'Delete' })
    await waitFor(() => expect(isDisabled(remove)).toBe(false))
    expect(remove.getAttribute('aria-describedby')).toBeNull()
  })
})

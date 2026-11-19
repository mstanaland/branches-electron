// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { Commit } from '../../../shared/git'
import type { RendererApi } from '../api'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  listCommits: vi.fn<RendererApi['listCommits']>()
}))
vi.mock('../api', () => ({ api }))

import { COMMIT_PAGE_SIZE } from '../data'
import { CommitHistory } from './CommitHistory'

const ROOT = '/repos/alpha'

/** Oids are padded to full length, as git gives them, so `shortOid` has something to cut. */
function oidOf(seed: string): string {
  return seed.padEnd(40, '0')
}

function commit(seed: string, overrides: Partial<Commit> = {}): Commit {
  const oid = oidOf(seed)
  return {
    oid,
    shortOid: oid.slice(0, 8),
    parents: [],
    subject: `Subject ${seed}`,
    authorName: 'Michael Stanaland',
    authorDate: '2026-11-14T17:31:27-05:00',
    ...overrides
  }
}

function show(commits: Commit[], ref = 'main'): void {
  api.listCommits.mockResolvedValue(commits)
  renderWithProviders(<CommitHistory root={ROOT} commitRef={ref} />, { tabs: [ROOT] })
}

const rows = (): HTMLElement[] => screen.getAllByRole('option')

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

afterEach(cleanup)

describe('the list', () => {
  it('shows the author, the date, the short oid and the subject', async () => {
    show([commit('ab12cd34ef')])

    const row = await screen.findByRole('option')
    expect(within(row).getByText('Michael Stanaland')).toBeTruthy()
    expect(within(row).getByText('ab12cd34')).toBeTruthy()
    expect(within(row).getByText('Subject ab12cd34ef')).toBeTruthy()
    // The locale's short date, whatever locale the test machine is in.
    const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(
      new Date('2026-11-14T17:31:27-05:00')
    )
    expect(within(row).getByText(expected)).toBeTruthy()
  })

  it('keeps the order it was given, newest first', async () => {
    show([commit('aaa'), commit('bbb'), commit('ccc')])
    await screen.findAllByRole('option')

    expect(rows().map((row) => row.getAttribute('data-oid'))).toEqual([
      oidOf('aaa'),
      oidOf('bbb'),
      oidOf('ccc')
    ])
  })

  it('asks for the branch it was given', async () => {
    show([commit('aaa')], 'feature/login')
    await screen.findByRole('option')

    expect(api.listCommits).toHaveBeenCalledWith(ROOT, 'feature/login', COMMIT_PAGE_SIZE, 0)
  })

  it('survives a date git gave that cannot be parsed', async () => {
    show([commit('aaa', { authorDate: 'not a date' })])

    const row = await screen.findByRole('option')
    // The row is still there and still readable; only the date is missing.
    expect(within(row).getByText('Subject aaa')).toBeTruthy()
  })
})

describe('empty and failed', () => {
  it('says so when the repository has no commits', async () => {
    show([])

    await screen.findByText('No commits yet.')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('shows nothing at all while the first page is loading', () => {
    api.listCommits.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<CommitHistory root={ROOT} commitRef="main" />, { tabs: [ROOT] })

    expect(screen.queryByText('No commits yet.')).toBeNull()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('reports a failure', async () => {
    api.listCommits.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git said no' })
    )
    renderWithProviders(<CommitHistory root={ROOT} commitRef="main" />, { tabs: [ROOT] })

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toBe('git said no')
  })

  it('stays out of the way when the repository is gone', async () => {
    api.listCommits.mockRejectedValue(new ApiError({ code: 'NOT_A_REPOSITORY', message: 'gone' }))
    const { container } = renderWithProviders(<CommitHistory root={ROOT} commitRef="main" />, {
      tabs: [ROOT]
    })

    await waitFor(() => expect(container.querySelector('section')).toBeNull())
  })
})

describe('selecting a commit', () => {
  it('highlights the row that was clicked', async () => {
    show([commit('aaa'), commit('bbb')])
    await screen.findAllByRole('option')

    fireEvent.click(rows()[1])

    expect(rows()[1].getAttribute('aria-selected')).toBe('true')
    expect(rows()[0].getAttribute('aria-selected')).toBe('false')
  })

  it('moves the highlight with the arrow keys, Home and End', async () => {
    show([commit('aaa'), commit('bbb'), commit('ccc')])
    await screen.findAllByRole('option')

    fireEvent.click(rows()[0])
    fireEvent.keyDown(rows()[0], { key: 'ArrowDown' })
    expect(rows()[1].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(rows()[1], { key: 'End' })
    expect(rows()[2].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(rows()[2], { key: 'Home' })
    expect(rows()[0].getAttribute('aria-selected')).toBe('true')

    // Already at the top: Up stays put rather than wrapping round.
    fireEvent.keyDown(rows()[0], { key: 'ArrowUp' })
    expect(rows()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('is one tab stop: the selected row, or the first one', async () => {
    show([commit('aaa'), commit('bbb')])
    await screen.findAllByRole('option')

    expect(rows().map((row) => row.getAttribute('tabindex'))).toEqual(['0', '-1'])

    fireEvent.click(rows()[1])
    expect(rows().map((row) => row.getAttribute('tabindex'))).toEqual(['-1', '0'])
  })
})

/** `IntersectionObserver` isn't in jsdom; this one reports the sentinel as visible at once. */
function observeImmediately(): void {
  class Immediate {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element): void {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      )
    }
    disconnect(): void {}
    unobserve(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', Immediate)
}

const fullPage = (prefix: string): Commit[] =>
  Array.from({ length: COMMIT_PAGE_SIZE }, (_, index) => commit(`${prefix}${index}`))

describe('paging', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks for the next page anchored to the first page, not the branch', async () => {
    observeImmediately()
    const first = fullPage('a')
    api.listCommits.mockResolvedValueOnce(first).mockResolvedValueOnce([commit('zzz')])
    renderWithProviders(<CommitHistory root={ROOT} commitRef="main" />, { tabs: [ROOT] })

    await screen.findByText('Subject zzz')
    // The branch can move between pages; the oid the list started from cannot.
    expect(api.listCommits).toHaveBeenNthCalledWith(1, ROOT, 'main', COMMIT_PAGE_SIZE, 0)
    expect(api.listCommits).toHaveBeenNthCalledWith(
      2,
      ROOT,
      first[0].oid,
      COMMIT_PAGE_SIZE,
      COMMIT_PAGE_SIZE
    )
  })

  it('stops at a short page', async () => {
    observeImmediately()
    api.listCommits.mockResolvedValue([commit('aaa')])
    renderWithProviders(<CommitHistory root={ROOT} commitRef="main" />, { tabs: [ROOT] })

    await screen.findByText('Subject aaa')
    await waitFor(() => expect(api.listCommits).toHaveBeenCalledTimes(1))
  })
})

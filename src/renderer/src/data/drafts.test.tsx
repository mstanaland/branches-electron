// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllDrafts, useDraft } from './drafts'

const ONE = '/repos/one'
const TWO = '/repos/two'

beforeEach(clearAllDrafts)

describe('useDraft', () => {
  it('starts empty and collapsed', () => {
    const { result } = renderHook(() => useDraft(ONE))

    expect(result.current.draft).toEqual({ subject: '', description: '', expanded: false })
  })

  it('keeps what the user typed', () => {
    const { result } = renderHook(() => useDraft(ONE))

    act(() => result.current.setSubject('Fix the thing'))
    act(() => result.current.setDescription('Because it was broken.'))

    expect(result.current.draft.subject).toBe('Fix the thing')
    expect(result.current.draft.description).toBe('Because it was broken.')
  })

  it('restores a repository’s draft, and its expanded state, after switching away and back', () => {
    const { result, rerender } = renderHook(({ root }) => useDraft(root), {
      initialProps: { root: ONE }
    })
    act(() => result.current.setSubject('One’s subject'))
    act(() => result.current.setExpanded(true))

    rerender({ root: TWO })
    expect(result.current.draft).toEqual({ subject: '', description: '', expanded: false })

    rerender({ root: ONE })
    expect(result.current.draft).toEqual({
      subject: 'One’s subject',
      description: '',
      expanded: true
    })
  })

  it('keeps each repository’s draft separate', () => {
    const one = renderHook(() => useDraft(ONE))
    const two = renderHook(() => useDraft(TWO))

    act(() => one.result.current.setSubject('For one'))
    act(() => two.result.current.setSubject('For two'))

    expect(one.result.current.draft.subject).toBe('For one')
    expect(two.result.current.draft.subject).toBe('For two')
  })

  it('survives the hook unmounting, since the form remounts on a repository switch', () => {
    const first = renderHook(() => useDraft(ONE))
    act(() => first.result.current.setDescription('Kept'))
    first.unmount()

    const second = renderHook(() => useDraft(ONE))

    expect(second.result.current.draft.description).toBe('Kept')
  })

  it('clears the subject, the description and the expanded state together', () => {
    const { result } = renderHook(() => useDraft(ONE))
    act(() => result.current.setSubject('Gone'))
    act(() => result.current.setDescription('Also gone'))
    act(() => result.current.setExpanded(true))

    act(() => result.current.clear())

    expect(result.current.draft).toEqual({ subject: '', description: '', expanded: false })
  })
})

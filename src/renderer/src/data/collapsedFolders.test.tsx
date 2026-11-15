// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFolderExpansion } from './collapsedFolders'

const KEY = 'branches.collapsedFolders./repos/alpha'

beforeEach(() => {
  localStorage.clear()
})

afterEach(cleanup)

describe('useFolderExpansion', () => {
  it('keeps every change when several are made before the next render', () => {
    const { result } = renderHook(() => useFolderExpansion('/repos/alpha'))

    act(() => {
      result.current.setExpanded('feature', false)
      result.current.setExpanded('fix', false)
    })

    expect(result.current.isExpanded('feature')).toBe(false)
    expect(result.current.isExpanded('fix')).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['feature', 'fix'])
  })

  it('expands again by removing the folder from the saved collapsed list', () => {
    localStorage.setItem(KEY, JSON.stringify(['feature', 'fix']))
    const { result } = renderHook(() => useFolderExpansion('/repos/alpha'))

    act(() => result.current.setExpanded('feature', true))

    expect(result.current.isExpanded('feature')).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['fix'])
  })
})

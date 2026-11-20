import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { TabCommand } from '../shared/tabs'
import type { BranchMenuAction } from '../shared/git'
import { createBranchMenuTemplate, createMenuTemplate } from './menu'

interface Spies {
  openRepository: ReturnType<typeof vi.fn<() => void>>
  tabCommand: ReturnType<typeof vi.fn<(command: TabCommand) => void>>
}

function spies(): Spies {
  return { openRepository: vi.fn<() => void>(), tabCommand: vi.fn<(c: TabCommand) => void>() }
}

function createTemplate(
  tabCount: number | null = 1,
  calls: Spies = spies()
): MenuItemConstructorOptions[] {
  return createMenuTemplate({ appName: 'Branches', tabCount, ...calls })
}

function submenuOf(
  template: MenuItemConstructorOptions[],
  menuLabel: string
): MenuItemConstructorOptions[] {
  const menu = template.find((entry) => entry.label === menuLabel)
  if (!menu || !Array.isArray(menu.submenu)) throw new Error(`No ${menuLabel} menu`)
  return menu.submenu
}

/** One item by label, from the menu it belongs to. */
function itemOf(
  template: MenuItemConstructorOptions[],
  menuLabel: string,
  itemLabel: string
): MenuItemConstructorOptions {
  const item = submenuOf(template, menuLabel).find((entry) => entry.label === itemLabel)
  if (item === undefined) throw new Error(`No ${menuLabel} > ${itemLabel} item`)
  return item
}

/** Clicks an item the way Electron does, with the arguments our handlers ignore. */
function click(item: MenuItemConstructorOptions): void {
  if (!item.click) throw new Error(`${String(item.label)} has no click handler`)
  ;(item.click as () => void)()
}

describe('createMenuTemplate', () => {
  it('has File > Open Repository… on Cmd+O that asks the app to open a repository', () => {
    const calls = spies()
    const item = itemOf(createTemplate(1, calls), 'File', 'Open Repository…')

    expect(item.accelerator).toBe('CmdOrCtrl+O')
    expect(item.enabled).not.toBe(false)
    click(item)
    expect(calls.openRepository).toHaveBeenCalledOnce()
  })

  it('disables Open Repository… at four tabs, so the picker has nowhere to put nothing', () => {
    expect(itemOf(createTemplate(4), 'File', 'Open Repository…').enabled).toBe(false)
  })

  it('keeps the standard Edit roles so copy and paste work in text fields', () => {
    const roles = submenuOf(createTemplate(), 'Edit').map((item) => item.role)

    expect(roles).toEqual(
      expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])
    )
  })

  it('puts the app menu first, named after the app, with a Quit item', () => {
    const template = createTemplate()

    expect(template[0].label).toBe('Branches')
    expect(submenuOf(template, 'Branches').map((item) => item.role)).toContain('quit')
  })
})

describe('the Window menu', () => {
  it('has New Tab on Cmd+T, disabled only once the strip is full', () => {
    const calls = spies()
    const item = itemOf(createTemplate(3, calls), 'Window', 'New Tab')

    expect(item.accelerator).toBe('CmdOrCtrl+T')
    expect(item.enabled).not.toBe(false)
    click(item)
    expect(calls.tabCommand).toHaveBeenCalledWith({ type: 'new' })

    expect(itemOf(createTemplate(4), 'Window', 'New Tab').enabled).toBe(false)
  })

  it('has Close Tab on Cmd+W while any tab is open, and closes the focused one', () => {
    const calls = spies()
    const item = itemOf(createTemplate(1, calls), 'Window', 'Close Tab')

    expect(item.accelerator).toBe('CmdOrCtrl+W')
    expect(item.role).toBeUndefined()
    click(item)
    expect(calls.tabCommand).toHaveBeenCalledWith({ type: 'close' })
  })

  it('turns Cmd+W into Close Window only once no tab is left', () => {
    const template = createTemplate(0)

    expect(submenuOf(template, 'Window').map((item) => item.label)).not.toContain('Close Tab')
    const item = itemOf(template, 'Window', 'Close Window')
    expect(item.accelerator).toBe('CmdOrCtrl+W')
    expect(item.role).toBe('close')
  })

  it('moves between tabs with Cmd+Shift+[ and Cmd+Shift+], while there are two to move between', () => {
    const calls = spies()
    const template = createTemplate(2, calls)

    const previous = itemOf(template, 'Window', 'Show Previous Tab')
    const next = itemOf(template, 'Window', 'Show Next Tab')
    expect(previous.accelerator).toBe('CmdOrCtrl+Shift+[')
    expect(next.accelerator).toBe('CmdOrCtrl+Shift+]')

    click(previous)
    click(next)
    expect(calls.tabCommand.mock.calls).toEqual([[{ type: 'previous' }], [{ type: 'next' }]])

    for (const label of ['Show Previous Tab', 'Show Next Tab']) {
      expect(itemOf(createTemplate(1), 'Window', label).enabled).toBe(false)
    }
  })

  it('focuses the first through fourth tab on Cmd+1 to Cmd+4', () => {
    const calls = spies()
    const labels = ['Show First Tab', 'Show Second Tab', 'Show Third Tab', 'Show Fourth Tab']
    const template = createTemplate(4, calls)

    labels.forEach((label, index) => {
      const item = itemOf(template, 'Window', label)
      expect(item.accelerator).toBe(`CmdOrCtrl+${index + 1}`)
      expect(item.enabled).not.toBe(false)
      click(item)
      expect(calls.tabCommand).toHaveBeenLastCalledWith({ type: 'focus', index })
    })
  })

  it('disables the tab a strip this short does not have', () => {
    const template = createTemplate(2)

    expect(itemOf(template, 'Window', 'Show Second Tab').enabled).not.toBe(false)
    expect(itemOf(template, 'Window', 'Show Third Tab').enabled).toBe(false)
    expect(itemOf(template, 'Window', 'Show Fourth Tab').enabled).toBe(false)
  })

  it('offers nothing to close before the renderer has said how many tabs there are', () => {
    // The count is a round trip, so the first menu is built before the strip is restored.
    // Closing the window then would be exactly the surprise Cmd+W is meant not to be.
    const template = createTemplate(null)

    expect(submenuOf(template, 'Window').map((item) => item.label)).not.toContain('Close Window')
    expect(itemOf(template, 'Window', 'Close Tab').enabled).toBe(false)
    expect(itemOf(template, 'Window', 'Show First Tab').enabled).toBe(false)
    expect(itemOf(template, 'Window', 'Show Previous Tab').enabled).toBe(false)
    // Opening is still allowed: the strip refuses it on its own if it turns out to be full.
    expect(itemOf(template, 'Window', 'New Tab').enabled).not.toBe(false)
    expect(itemOf(template, 'File', 'Open Repository…').enabled).not.toBe(false)
  })

  it('keeps the window roles a Mac Window menu is expected to have', () => {
    const roles = submenuOf(createTemplate(), 'Window').map((item) => item.role)

    expect(roles).toEqual(expect.arrayContaining(['minimize', 'zoom', 'front']))
  })
})

function branchMenu(deletable: boolean, isCurrent = false): MenuItemConstructorOptions[] {
  return createBranchMenuTemplate({ name: 'feature/login', isCurrent, deletable }, () => {})
}

describe('createBranchMenuTemplate', () => {
  it('offers to delete the branch by name', () => {
    const remove = branchMenu(true).find((item) => item.label === 'Delete “feature/login”…')
    expect(remove?.enabled).toBe(true)
  })

  it('disables Delete for a branch that cannot be deleted', () => {
    const remove = branchMenu(false, true).find((item) => item.label?.startsWith('Delete'))
    expect(remove?.enabled).toBe(false)
  })

  it('reports the choice', () => {
    const choose = vi.fn<(action: BranchMenuAction) => void>()
    const template = createBranchMenuTemplate(
      { name: 'feature', isCurrent: false, deletable: true },
      choose
    )
    const onDelete = template.find((item) => item.label?.startsWith('Delete'))?.click
    // Electron passes menu item, window and event; none matter here.
    ;(onDelete as () => void)()
    expect(choose).toHaveBeenCalledWith('delete')
  })
})

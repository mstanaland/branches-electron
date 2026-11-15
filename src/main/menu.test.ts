import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { createMenuTemplate } from './menu'

function createTemplate(openRepository = vi.fn<() => void>()): MenuItemConstructorOptions[] {
  return createMenuTemplate({ appName: 'Branches', openRepository })
}

function submenuOf(
  template: MenuItemConstructorOptions[],
  menuLabel: string
): MenuItemConstructorOptions[] {
  const menu = template.find((entry) => entry.label === menuLabel)
  if (!menu || !Array.isArray(menu.submenu)) throw new Error(`No ${menuLabel} menu`)
  return menu.submenu
}

describe('createMenuTemplate', () => {
  it('has File > Open Repository… on Cmd+O that asks the app to open a repository', () => {
    const openRepository = vi.fn<() => void>()
    const item = submenuOf(createTemplate(openRepository), 'File').find(
      (entry) => entry.label === 'Open Repository…'
    )
    if (!item?.click) throw new Error('No Open Repository… item')

    expect(item.accelerator).toBe('CmdOrCtrl+O')
    ;(item.click as () => void)()
    expect(openRepository).toHaveBeenCalledOnce()
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

import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { getGitExecutable } from './git'
import { registerIpc } from './ipc'
import { createMenuTemplate } from './menu'
import type { TabCommand } from '../shared/tabs'

/**
 * How many tabs there are, as the renderer last reported, and null until it first does. The
 * application menu is one per app
 * on a Mac, so this is one number rather than one per window — which is also why a second
 * window would need this rebuilt on focus. The renderer owns the strip (ADR 0007) and reports
 * its size because the menu is built around it: at the limit New Tab and Open Repository … are
 * disabled, and Cmd+W closes a tab until there is none left to close (ADR 0008).
 */
let tabCount: number | null = null

/** The renderer owns the open flow, the strip and the active repository, so it is told to act. */
function tellRenderer(channel: string, ...args: unknown[]): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(channel, ...args)
}

/** Rebuilds the application menu around the current tab count. Cheap, and runs rarely. */
function applyApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      createMenuTemplate({
        appName: app.name,
        tabCount,
        openRepository: () => tellRenderer('menu:open-repository'),
        tabCommand: (command: TabCommand) => tellRenderer('menu:tab-command', command)
      })
    )
  )
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 480,
    show: false,
    title: 'Branches',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // The window title is ours: it follows the active repository (see windowTitle.ts). Electron
  // otherwise takes it from the document on every load, which a reload would reset.
  mainWindow.on('page-title-updated', (event) => event.preventDefault())

  // Open external links in the default browser, never in the app window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite serves the renderer with HMR in dev; production loads the built file.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.branches.app')

  // F12 toggles DevTools in dev; Cmd+R reload is disabled in production.
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Locate git now so it's ready for the first git call. If it's missing, runGit reports
  // GIT_NOT_FOUND to the caller, so here we only log.
  getGitExecutable().catch((error: unknown) => console.error('Could not locate git:', error))

  registerIpc({
    setTabCount: (count) => {
      if (count === tabCount) return
      tabCount = count
      applyApplicationMenu()
    }
  })
  applyApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

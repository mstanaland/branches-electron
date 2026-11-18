import { basename } from 'node:path'
import type { SavedRepository } from '../shared/git'

export interface WindowTitleDeps {
  /** The application name, which is what the title says with no repository in front. */
  appName: string
  /** The saved repositories, which is where a repository's name comes from. */
  list: () => Promise<SavedRepository[]>
  /** Sets the window title. */
  setTitle: (title: string) => void
}

export interface WindowTitle {
  /**
   * Retitles the window for the **active repository**: its name, or the application name when
   * there is none — a **Repositories tab** or the **backdrop**.
   */
  follow: (root: string | null) => Promise<void>
}

/**
 * The window title, following the **active repository** — so Mission Control, the Window menu
 * and screen sharing name what is on screen rather than just the app.
 */
export function createWindowTitle(deps: WindowTitleDeps): WindowTitle {
  // Which follow is the current one. Reading the saved list is async, so two quick tab
  // switches can come back in either order; only the newest gets to set a title, or a slow
  // read would leave the window named after the tab the user just left.
  let latest = 0
  return {
    async follow(root) {
      const mine = ++latest
      // A name is a nicety: an unreadable list retitles to the app rather than throwing at
      // the IPC call that only meant to say which repository is in front.
      const repositories = await deps.list().catch((error: unknown) => {
        console.error('Could not read the repository list for the window title:', error)
        return []
      })
      if (mine !== latest) return
      if (root === null) {
        deps.setTitle(deps.appName)
        return
      }
      const name = repositories.find((repository) => repository.root === root)?.name
      // The folder's own name when the list has nothing to say — a root that was never saved,
      // or a read that failed. It is what the saved name would be anyway, and what the tab
      // already says, so the window and the strip agree.
      deps.setTitle(name ?? basename(root))
    }
  }
}

import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { ghNotFound } from './errors'

export interface LocateGhDeps {
  home: string
  env: NodeJS.ProcessEnv
  isExecutable(path: string): Promise<boolean>
  /** Runs `command -v gh` in the user's login shell and resolves with its stdout. */
  askLoginShell(): Promise<string>
}

/**
 * Where the GitHub CLI's installers put `gh`, most likely first: Homebrew on Apple silicon,
 * Intel Homebrew and the official installer, MacPorts, then a user-local bin. An app launched
 * from Finder gets launchd's minimal PATH, so a bare `gh` would never be found.
 */
function candidates(home: string): string[] {
  return ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/opt/local/bin/gh', `${home}/.local/bin/gh`]
}

/**
 * Finds the user's `gh` the way `claude` is found (ADR-0010): `BRANCHES_GH_PATH`, then the
 * usual install locations, then whatever their login shell's PATH finds. Only an absolute,
 * executable path counts. Rejects with GH_NOT_FOUND when nothing turns one up.
 */
export async function locateGh(deps: LocateGhDeps): Promise<string> {
  const override = deps.env.BRANCHES_GH_PATH
  const known = candidates(deps.home)
  for (const path of override && isAbsolute(override) ? [override, ...known] : known) {
    if (await deps.isExecutable(path)) return path
  }
  try {
    // `command -v` prints a path for a program, but an alias or function prints something
    // else. Only the last line: an interactive shell's startup files can print things too.
    const answer = (await deps.askLoginShell()).trim().split('\n').at(-1)?.trim() ?? ''
    if (isAbsolute(answer) && (await deps.isExecutable(answer))) return answer
  } catch {
    // No shell, or `gh` isn't on its PATH either.
  }
  throw ghNotFound()
}

const realDeps: LocateGhDeps = {
  home: homedir(),
  env: process.env,
  isExecutable: (path) =>
    access(path, constants.X_OK).then(
      () => true,
      () => false
    ),
  askLoginShell: () =>
    new Promise((resolve, reject) => {
      // A login (-l), interactive (-i) shell reads the profile and the rc file, either of which
      // may be where PATH gets `gh`. The command is a fixed string, with nothing from the user
      // or the renderer in it.
      const shell = process.env.SHELL || '/bin/zsh'
      execFile(
        shell,
        ['-i', '-l', '-c', 'command -v gh'],
        { encoding: 'utf8', timeout: 5000 },
        (error, stdout) => (error ? reject(error) : resolve(stdout))
      )
    })
}

/**
 * The user's `gh`, looked up afresh each time: it is cheap next to a network call, and it means
 * installing `gh` while Branches is open works without a restart.
 */
export function getGhExecutable(): Promise<string> {
  return locateGh(realDeps)
}

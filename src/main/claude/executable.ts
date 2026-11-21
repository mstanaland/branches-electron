import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { claudeNotFound } from './errors'

export interface LocateClaudeDeps {
  home: string
  env: NodeJS.ProcessEnv
  isExecutable(path: string): Promise<boolean>
  /** Runs `command -v claude` in the user's login shell and resolves with its stdout. */
  askLoginShell(): Promise<string>
}

/**
 * Where Claude Code's installers put `claude`, most likely first. An app launched from Finder
 * gets launchd's minimal PATH, not the shell's, so a bare `claude` would never be found.
 */
function candidates(home: string): string[] {
  return [
    `${home}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    `${home}/.claude/local/claude`
  ]
}

/**
 * Finds the user's `claude`: the usual install locations first, then whatever their login
 * shell's PATH finds. Rejects with CLAUDE_NOT_FOUND when neither turns one up.
 */
export async function locateClaude(deps: LocateClaudeDeps): Promise<string> {
  const override = deps.env.BRANCHES_CLAUDE_PATH
  const known = candidates(deps.home)
  for (const path of override ? [override, ...known] : known) {
    if (await deps.isExecutable(path)) return path
  }
  try {
    // `command -v` prints a path for a program, but an alias or function prints something
    // else — so only an absolute path that really is executable counts.
    // Only the last line: an interactive shell's startup files can print things of their own.
    const answer = (await deps.askLoginShell()).trim().split('\n').at(-1)?.trim() ?? ''
    if (isAbsolute(answer) && (await deps.isExecutable(answer))) return answer
  } catch {
    // No shell, or `claude` isn't on its PATH either.
  }
  throw claudeNotFound()
}

const realDeps: LocateClaudeDeps = {
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
      // may be where PATH gets `claude`. The command is a fixed string, with nothing from the
      // user or the renderer in it.
      const shell = process.env.SHELL || '/bin/zsh'
      execFile(
        shell,
        ['-i', '-l', '-c', 'command -v claude'],
        { encoding: 'utf8', timeout: 5000 },
        (error, stdout) => (error ? reject(error) : resolve(stdout))
      )
    })
}

/**
 * The user's `claude`, looked up afresh each time: it is cheap, and it means installing
 * Claude Code while Branches is open works without a restart.
 */
export function getClaudeExecutable(): Promise<string> {
  return locateClaude(realDeps)
}

import { GitError } from './errors'
import { runGit } from './run'

/**
 * Resolves a folder (which may be a subfolder of a work tree) to the
 * repository's top-level directory.
 */
export async function resolveRepositoryRoot(folder: string): Promise<string> {
  try {
    const { stdout } = await runGit(folder, ['rev-parse', '--show-toplevel'])
    return stdout.trim()
  } catch (error) {
    if (error instanceof GitError && error.code === 'COMMAND_FAILED') {
      throw new GitError('NOT_A_REPOSITORY', `${folder} is not inside a git repository.`, {
        args: error.args,
        exitCode: error.exitCode,
        stderr: error.stderr
      })
    }
    throw error
  }
}

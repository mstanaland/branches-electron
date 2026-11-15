import { realpath } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { ApiError } from '../shared/apiError'

/**
 * Checks that reading `path` (already known to be relative, with no "..") cannot leave the
 * repository through a symlinked folder. `git diff --no-index` follows folder links, so a
 * folder in the work tree linked to somewhere else would otherwise expose files outside it.
 * A file that is itself a symlink is fine: git reports where it points, not what is there.
 * A folder that doesn't exist yet has nothing to leak.
 */
export async function assertInsideRoot(root: string, path: string): Promise<void> {
  let folder: string
  try {
    folder = await realpath(dirname(join(root, path)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  const realRoot = await realpath(root)
  if (folder !== realRoot && !folder.startsWith(realRoot + sep)) {
    throw new ApiError({ code: 'INVALID_PATH', message: `${path} points outside the repository.` })
  }
}

import { ApiError } from './apiError'

/**
 * Checks a file path received over IPC. It must be relative to the repository root and
 * must not climb out of it. A ".." inside a name (like "a..b") is fine; only a whole ".."
 * segment is rejected.
 */
export function assertRelativePath(path: string): void {
  if (path === '') {
    throw new ApiError({ code: 'INVALID_PATH', message: 'The file path is empty.' })
  }
  if (path.startsWith('/')) {
    throw new ApiError({ code: 'INVALID_PATH', message: `${path} is not a relative path.` })
  }
  if (path.split('/').includes('..')) {
    throw new ApiError({ code: 'INVALID_PATH', message: `${path} points outside the repository.` })
  }
}

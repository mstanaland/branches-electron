import type { ApiErrorData } from './apiError'

/**
 * What a handler in main sends back over IPC. Electron's contextBridge strips an error's
 * `code` and `stderr`, so failures travel as data and the renderer rethrows them
 * (see `unwrapApi` in the renderer).
 */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiErrorData }

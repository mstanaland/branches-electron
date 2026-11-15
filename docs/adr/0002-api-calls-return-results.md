# window.api calls resolve with a result; the renderer rethrows

Electron's `contextBridge` strips everything but the message from an `Error` thrown across it, so `code` and `stderr` never reach the renderer (checked in a sandboxed preload). `window.api` methods therefore resolve with `ApiResult<T>` (plain data), and the renderer calls them through `unwrapApi`, which rejects with a real `ApiError`. The alternative was encoding the error as JSON in the message and parsing it back, which relies on a string convention. Any new `BranchesApi` method must return `ApiResult`.

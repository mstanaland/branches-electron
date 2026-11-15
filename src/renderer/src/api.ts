import { unwrapApi } from './unwrapApi'

/** Use this, not `window.api`: failed calls reject with an `ApiError` you can check `.code` on. */
export const api = unwrapApi(window.api)

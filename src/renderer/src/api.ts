import type { BranchesEvents } from '../../shared/api'
import { unwrapApi, type UnwrappedApi } from './unwrapApi'

/** Calls that reject with an `ApiError`, plus the events main pushes to us. */
export type RendererApi = UnwrappedApi & BranchesEvents

// Events aren't calls, so they bypass `unwrapApi`, which would wrap them in a promise.
const { onOpenRepositoryRequested, ...calls } = window.api

/** Use this, not `window.api`: failed calls reject with an `ApiError` you can check `.code` on. */
export const api: RendererApi = { ...unwrapApi(calls), onOpenRepositoryRequested }

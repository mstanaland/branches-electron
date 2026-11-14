/**
 * The typed bridge between the renderer (React) and the main process (Node).
 * The renderer never touches Node or git directly; it only calls these.
 * Git commands get added here as the git layer is ported.
 */
export interface BranchesApi {
  /** Returns the app version. A placeholder that proves the bridge works. */
  appVersion: () => Promise<string>
}

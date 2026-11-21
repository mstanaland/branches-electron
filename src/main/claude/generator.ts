import type { CommitMessage } from '../../shared/git'
import type { CommitContext } from '../git/commitContext'
import { generateCancelled } from './errors'
import { writeCommitMessage } from './generate'

export interface GeneratorDeps {
  /** Finds the user's `claude`. Rejects with CLAUDE_NOT_FOUND. */
  locate: () => Promise<string>
  /** Reads the staged diff and recent subjects for a repository. */
  readContext: (root: string) => Promise<CommitContext>
  timeoutMs?: number
}

export interface CommitMessageGenerator {
  /**
   * **Generate** for `root`: writes a commit message for what is staged, with `draft` as
   * guidance. Starting one stops any run already going for the same repository.
   */
  generate: (root: string, draft: CommitMessage) => Promise<CommitMessage>
  /** Stops `root`'s run, if any. That run then fails with GENERATE_CANCELLED. */
  cancel: (root: string) => void
}

/** Keeps at most one **Generate** run per repository, so Stop knows what to stop. */
export function createCommitMessageGenerator(deps: GeneratorDeps): CommitMessageGenerator {
  const running = new Map<string, AbortController>()

  function cancel(root: string): void {
    running.get(root)?.abort()
    running.delete(root)
  }

  return {
    cancel,
    async generate(root, draft) {
      cancel(root)
      const controller = new AbortController()
      running.set(root, controller)
      const throwIfStopped = (): void => {
        if (controller.signal.aborted) throw generateCancelled()
      }
      try {
        const [claudePath, context] = await Promise.all([deps.locate(), deps.readContext(root)])
        // Stopped while looking for `claude` or reading the diff: don't start it at all.
        throwIfStopped()
        return await writeCommitMessage({
          claudePath,
          context,
          draft,
          signal: controller.signal,
          timeoutMs: deps.timeoutMs
        })
      } finally {
        if (running.get(root) === controller) running.delete(root)
      }
    }
  }
}

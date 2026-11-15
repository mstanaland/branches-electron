/** The tail of each repository's write queue. A repository with nothing pending has no entry. */
const tails = new Map<string, Promise<unknown>>()

/**
 * Runs a git write after every earlier write to the same repository has finished, so two
 * writes never race for `.git/index.lock`. Different repositories don't wait for each other,
 * and reads never go through here.
 */
export function enqueueWrite<T>(root: string, write: () => Promise<T>): Promise<T> {
  const previous = tails.get(root) ?? Promise.resolve()
  // A failed write must not stop the writes queued behind it.
  const result = previous.then(write, write)
  const tail = result.catch(() => {})
  tails.set(root, tail)
  void tail.then(() => {
    if (tails.get(root) === tail) tails.delete(root)
  })
  return result
}

import type { Commit } from './git'

/**
 * Lanes the graph column is drawn for. Past this the column stops widening and deeper lanes
 * are drawn in the last position, overlapping: eight simultaneous lines of work is already
 * far more than a readable graph, and the alternative is a column that eats the subject.
 * Lane colours cycle through this many values too.
 */
export const MAX_LANES = 8

/** One row of the graph: where the commit's node sits and what is drawn around it. */
export interface CommitGraphRow {
  /** Lane the node sits in. */
  lane: number
  /**
   * Lanes entering from the top of the row and ending at the node — one per child already
   * listed above. Empty for a commit with no child in the list, which is what leaves the
   * topmost node with no line above it.
   */
  into: number[]
  /** Lanes passing straight through the row, untouched by this commit. */
  through: number[]
  /** Lanes leaving the node towards the bottom of the row — one per parent. */
  out: number[]
}

export interface CommitGraph {
  rows: CommitGraphRow[]
  /** How many lanes the column has to be drawn for, never more than `MAX_LANES`. */
  laneCount: number
}

/** First lane with nothing in it, or a new one on the end. */
function firstFree(lanes: (string | null)[]): number {
  const free = lanes.indexOf(null)
  return free === -1 ? lanes.length : free
}

/**
 * Assigns every commit a lane and works out what the row has to draw.
 *
 * Walks the list top to bottom, keeping one slot per open lane holding the oid that lane is
 * waiting for. A commit takes the leftmost lane waiting for it — or a free one if nothing is,
 * which is how a branch tip starts a line — and hands its lanes on to its parents. A merge
 * opens a lane per extra parent; lanes waiting for the same parent collapse into one when
 * that parent comes around, which is what draws two lines joining.
 *
 * Commits must be in the order they will be rendered, parents after children (`--topo-order`).
 * The list is a page of history rather than the whole of it, so lanes left open at the end
 * simply run off the bottom, and `out` lanes pointing at parents that were never listed are
 * expected rather than a bug. This is why the caller recomputes over the whole accumulated
 * list on every append instead of continuing from where the last page stopped: a lane that
 * starts mid-page would otherwise be assigned a different position each time.
 */
export function buildCommitGraph(commits: readonly Commit[]): CommitGraph {
  const lanes: (string | null)[] = []
  const rows: CommitGraphRow[] = []
  let widest = 0

  for (const commit of commits) {
    // Every lane waiting for this commit ends at it. The leftmost becomes the node's lane,
    // so a line stays as far left as it can rather than drifting right down the list.
    const into: number[] = []
    const through: number[] = []
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === null) continue
      if (lanes[i] === commit.oid) into.push(i)
      else through.push(i)
    }
    const lane = into.length > 0 ? into[0] : firstFree(lanes)

    // Free them before placing the parents, so a parent can reuse one of them.
    for (const index of into) lanes[index] = null
    lanes[lane] = null

    const out: number[] = []
    commit.parents.forEach((parent, index) => {
      // A parent another lane is already waiting for doesn't get a second lane: the edge
      // bends across to it, and the two lines meet at that parent's own row.
      const existing = lanes.indexOf(parent)
      if (existing !== -1) {
        out.push(existing)
        return
      }
      // The first parent continues this commit's line; the rest open lanes of their own.
      const target = index === 0 ? lane : firstFree(lanes)
      lanes[target] = parent
      out.push(target)
    })

    // Trailing lanes that closed for good shouldn't keep the column wide.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    widest = Math.max(
      widest,
      lane + 1,
      lanes.length,
      ...into.map((index) => index + 1),
      ...through.map((index) => index + 1),
      ...out.map((index) => index + 1)
    )
    rows.push({ lane, into, through, out })
  }

  return { rows, laneCount: Math.min(widest, MAX_LANES) }
}

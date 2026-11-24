import type { Commit, DefaultBranchBase } from './git'

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
  /**
   * A stand-in for the default branch's line in lane 0, above where its listed history starts,
   * when the default branch has moved on past this history: `through` for the whole row,
   * `into` from the top of the row to the node it ends at. Not a real line — no commit is
   * drawn on it — just a marker that the default branch carries on beside this work.
   */
  placeholder: 'through' | 'into' | null
}

export interface CommitGraph {
  rows: CommitGraphRow[]
  /** How many lanes the column has to be drawn for, never more than `MAX_LANES`. */
  laneCount: number
}

/**
 * First lane with nothing in it, or a new one on the end. `from` skips the lanes before it,
 * which is how lane 0 stays held for the default branch's line.
 */
function firstFree(lanes: (string | null)[], from: number): number {
  for (let i = from; i < lanes.length; i++) if (lanes[i] === null) return i
  return Math.max(lanes.length, from)
}

/** Points `lane` at `oid`, padding with empty lanes so the list never has holes. */
function setLane(lanes: (string | null)[], lane: number, oid: string): void {
  while (lanes.length < lane) lanes.push(null)
  lanes[lane] = oid
}

/**
 * The listed commits on the default branch's own line: `trunkTip` and its first parents, for
 * as far as the list goes. Second parents are left out — they are the branches merged into it.
 */
function trunkOf(commits: readonly Commit[], trunkTip: string): Set<string> {
  const byOid = new Map(commits.map((commit) => [commit.oid, commit]))
  const trunk = new Set<string>()
  for (let commit = byOid.get(trunkTip); commit !== undefined;) {
    trunk.add(commit.oid)
    const parent = commit.parents[0]
    commit = parent === undefined ? undefined : byOid.get(parent)
  }
  return trunk
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
 * `base` is where the **default branch**'s line starts in this history, when there is one.
 * Lane 0 is held for it and its first parents, from the top of the list down, and nothing
 * else is placed there. Without it the line of whatever is listed first takes lane 0, and a
 * branch that merged the default branch in would push the default branch's line across to
 * lane 1. When the default branch has moved on past `base`, the rows above it carry a
 * `placeholder` for the line it went on with.
 *
 * Commits must be in the order they will be rendered, parents after children (`--topo-order`).
 * The list is a page of history rather than the whole of it, so lanes left open at the end
 * simply run off the bottom, and `out` lanes pointing at parents that were never listed are
 * expected rather than a bug. This is why the caller recomputes over the whole accumulated
 * list on every append instead of continuing from where the last page stopped: a lane that
 * starts mid-page would otherwise be assigned a different position each time.
 */
export function buildCommitGraph(
  commits: readonly Commit[],
  base: DefaultBranchBase | null = null
): CommitGraph {
  const trunkTip = base?.oid ?? null
  // Until lane 0 first holds the real line, the rows draw a stand-in for it.
  let placeholding = base?.movedOn ?? false
  const lanes: (string | null)[] = []
  const rows: CommitGraphRow[] = []
  let widest = 0
  // Held even while the tip is still on a page not yet loaded, so lanes don't shift on append.
  const firstOpen = trunkTip === null ? 0 : 1
  const trunk = trunkTip === null ? new Set<string>() : trunkOf(commits, trunkTip)

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
    const onTrunk = trunk.has(commit.oid)
    const lane = onTrunk ? 0 : into.length > 0 ? into[0] : firstFree(lanes, firstOpen)

    // Free them before placing the parents, so a parent can reuse one of them.
    for (const index of into) lanes[index] = null
    if (lane < lanes.length) lanes[lane] = null

    const out: number[] = []
    commit.parents.forEach((parent, index) => {
      // The default branch's line goes to lane 0, unless lane 0 is still waiting for a newer
      // commit of it: then this edge keeps a lane of its own until that line reaches it.
      if (trunk.has(parent) && (lanes[0] ?? null) === null) {
        setLane(lanes, 0, parent)
        out.push(0)
        return
      }
      // A parent another lane is already waiting for doesn't get a second lane: the edge
      // bends across to it, and the two lines meet at that parent's own row.
      const existing = lanes.indexOf(parent)
      if (existing !== -1) {
        out.push(existing)
        return
      }
      // The first parent continues this commit's line; the rest open lanes of their own.
      const target = index === 0 ? lane : firstFree(lanes, firstOpen)
      setLane(lanes, target, parent)
      out.push(target)
    })

    let placeholder: CommitGraphRow['placeholder'] = null
    if (placeholding) {
      // The line's first node ends it at the node; anything else that opens lane 0 in this
      // row — a merge of the default branch — takes it over at the bottom of the row.
      const endsAtNode = lane === 0 && !into.includes(0)
      placeholder = endsAtNode ? 'into' : 'through'
      if (endsAtNode || (lanes[0] ?? null) !== null) placeholding = false
    }

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
    rows.push({ lane, into, through, out, placeholder })
  }

  return { rows, laneCount: Math.min(widest, MAX_LANES) }
}

/**
 * Lane whose colour an `out` edge is drawn in. An edge that opens or continues a lane takes
 * that lane's colour. An edge that bends into a lane already open, a line already passing
 * through the row, is the end of the node's own line joining it, so it keeps the node's
 * colour. Otherwise the last stretch of a branch would turn the trunk's colour where it
 * meets the trunk.
 */
export function outEdgeColorLane(row: CommitGraphRow, target: number): number {
  return row.through.includes(target) ? row.lane : target
}

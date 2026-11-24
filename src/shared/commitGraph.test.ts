import { describe, expect, it } from 'vitest'
import { MAX_LANES, buildCommitGraph, outEdgeColorLane } from './commitGraph'
import type { CommitGraph, CommitGraphRow } from './commitGraph'
import type { Commit, DefaultBranchBase } from './git'

/**
 * Commits are written with single-letter oids: readable, and the graph never looks at the
 * shape of an oid. `parents` is in git's order, so the first is the commit's own line.
 */
function commit(oid: string, ...parents: string[]): Commit {
  return {
    oid,
    shortOid: oid,
    parents,
    subject: `commit ${oid}`,
    authorName: 'Test',
    authorDate: '2026-11-15T12:00:00Z'
  }
}

/** Where the default branch's line starts, and whether it has moved on since. */
function base(oid: string, movedOn = false): DefaultBranchBase {
  return { oid, movedOn }
}

describe('buildCommitGraph', () => {
  it('returns nothing for an empty list', () => {
    expect(buildCommitGraph([])).toEqual({ rows: [], laneCount: 0 })
  })

  it('puts a single-parent chain in one lane', () => {
    const graph = buildCommitGraph([commit('a', 'b'), commit('b', 'c'), commit('c')])

    expect(graph.laneCount).toBe(1)
    expect(graph.rows).toEqual([
      // The tip has no child above it, so nothing enters the node from the top.
      { lane: 0, into: [], through: [], out: [0], placeholder: null },
      { lane: 0, into: [0], through: [], out: [0], placeholder: null },
      // A root commit has no parents, so its lane closes here.
      { lane: 0, into: [0], through: [], out: [], placeholder: null }
    ])
  })

  it('opens a second lane for a merge and closes it where the lines meet', () => {
    // m merges s into the main line; both sides go back to the same root.
    const graph = buildCommitGraph([
      commit('m', 'a', 's'),
      commit('a', 'r'),
      commit('s', 'r'),
      commit('r')
    ])

    expect(graph.laneCount).toBe(2)
    expect(graph.rows).toEqual([
      // The merge sends its first parent down its own lane and opens lane 1 for the second.
      { lane: 0, into: [], through: [], out: [0, 1], placeholder: null },
      // a continues lane 0; the side branch passes straight through lane 1.
      { lane: 0, into: [0], through: [1], out: [0], placeholder: null },
      // s is in lane 1, and its parent r is already waited for in lane 0 — the edge bends
      // back rather than keeping a lane of its own.
      { lane: 1, into: [1], through: [0], out: [0], placeholder: null },
      // Both lines are waiting for r, so both enter its node and lane 1 is gone afterwards.
      { lane: 0, into: [0], through: [], out: [], placeholder: null }
    ])
  })

  it('keeps a merged-in branch in its own lane while it lasts', () => {
    const graph = buildCommitGraph([
      commit('m', 'a', 's2'),
      commit('a', 'r'),
      commit('s2', 's1'),
      commit('s1', 'r'),
      commit('r')
    ])

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 1, 1, 0])
    // Lane 0 passes behind both commits of the side branch.
    expect(graph.rows[2].through).toEqual([0])
    expect(graph.rows[3].through).toEqual([0])
    expect(graph.laneCount).toBe(2)
  })

  it('opens a lane per extra parent of an octopus merge', () => {
    const graph = buildCommitGraph([commit('o', 'a', 'b', 'c', 'd')])

    expect(graph.rows[0]).toEqual({
      lane: 0,
      into: [],
      through: [],
      out: [0, 1, 2, 3],
      placeholder: null
    })
    expect(graph.laneCount).toBe(4)
  })

  it('collapses an octopus merge whose parents are the same commit', () => {
    // Degenerate, but git allows it, and two lanes must not end up waiting for one oid.
    const graph = buildCommitGraph([commit('o', 'a', 'a'), commit('a')])

    expect(graph.rows[0].out).toEqual([0, 0])
    expect(graph.rows[1]).toEqual({ lane: 0, into: [0], through: [], out: [], placeholder: null })
  })

  it('gives each branch tip its own lane', () => {
    // Two tips listed one after the other, each with history of its own: nothing is waiting
    // for the second tip, so it takes a free lane instead of the first one's.
    const graph = buildCommitGraph([
      commit('x', 'x1'),
      commit('y', 'y1'),
      commit('x1'),
      commit('y1')
    ])

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 1, 0, 1])
    expect(graph.rows[1].into).toEqual([])
    expect(graph.laneCount).toBe(2)
  })

  it('reuses a lane freed by a closed line', () => {
    const graph = buildCommitGraph([
      commit('x'), // root, in lane 0, which closes immediately
      commit('y', 'y1'), // nothing is open, so this takes lane 0 again
      commit('y1')
    ])

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 0])
    expect(graph.laneCount).toBe(1)
  })

  it('leaves lanes open at the end of a partial page', () => {
    // A page ends mid-history: the last commit's parent was never listed, so its lane runs
    // off the bottom of the row rather than closing.
    const graph = buildCommitGraph([commit('a', 'b')])

    expect(graph.rows[0].out).toEqual([0])
  })

  it('stops widening the column past the lane cap', () => {
    const parents = Array.from({ length: MAX_LANES + 4 }, (_, index) => `p${index}`)
    const graph = buildCommitGraph([commit('o', ...parents)])

    // The lanes are still assigned, so the edges are right; only the column is capped.
    expect(graph.rows[0].out).toHaveLength(MAX_LANES + 4)
    expect(graph.laneCount).toBe(MAX_LANES)
  })
})

describe('buildCommitGraph with the default branch', () => {
  // The shape in the bug this guards: a branch (b2, b1) that merged main (t2, t1) back in at
  // m. Listed first, m's line used to take lane 0 and push main's line across to lane 1.
  const history = [
    commit('m', 'b2', 't2'),
    commit('t2', 't1'),
    commit('b2', 'b1'),
    commit('b1', 'f'),
    commit('t1', 'f'),
    commit('f', 'r'),
    commit('r')
  ]

  it("keeps the default branch's line in lane 0 below a branch that merged it", () => {
    const graph = buildCommitGraph(history, base('t2'))

    expect(graph.rows.map((row) => row.lane)).toEqual([1, 0, 1, 1, 0, 0, 0])
    expect(graph.rows).toEqual([
      // The merge's own line continues in lane 1; the merged-in parent opens lane 0.
      { lane: 1, into: [], through: [], out: [1, 0], placeholder: null },
      { lane: 0, into: [0], through: [1], out: [0], placeholder: null },
      { lane: 1, into: [1], through: [0], out: [1], placeholder: null },
      // b1 forked from f, but lane 0 is still waiting for t1: b1's line keeps lane 1 down to f.
      { lane: 1, into: [1], through: [0], out: [1], placeholder: null },
      { lane: 0, into: [0], through: [1], out: [0], placeholder: null },
      { lane: 0, into: [0, 1], through: [], out: [0], placeholder: null },
      { lane: 0, into: [0], through: [], out: [], placeholder: null }
    ])
  })

  it('puts the line listed first in lane 0 without a default branch', () => {
    expect(buildCommitGraph(history).rows[0].lane).toBe(0)
  })

  it('holds lane 0 before the default branch has been listed', () => {
    // A long branch whose fork point is on a page not loaded yet: lane 0 stays empty rather
    // than going to the branch and moving when the next page lands.
    const graph = buildCommitGraph([commit('b2', 'b1'), commit('b1', 'f')], base('f'))

    expect(graph.rows.map((row) => row.lane)).toEqual([1, 1])
    expect(graph.laneCount).toBe(2)
  })

  it('sends branches merged into the default branch to lanes of their own', () => {
    const graph = buildCommitGraph(
      [commit('t2', 't1', 's'), commit('s', 'r'), commit('t1', 'r'), commit('r')],
      base('t2')
    )

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 1, 0, 0])
  })
})

function placeholders(graph: CommitGraph): CommitGraphRow['placeholder'][] {
  return graph.rows.map((row) => row.placeholder)
}

describe('buildCommitGraph placeholder', () => {
  // A branch (b2, b1) forked from f, which the default branch has since moved on from.
  const forked = [commit('b2', 'b1'), commit('b1', 'f'), commit('f', 'r'), commit('r')]

  it('stands in for the default branch above the fork, once it has moved on', () => {
    // b1's line bends into lane 0 at the bottom of its row, where the real line takes over.
    expect(placeholders(buildCommitGraph(forked, base('f', true)))).toEqual([
      'through',
      'through',
      null,
      null
    ])
  })

  it('ends at the node of a branch with no commits of its own', () => {
    // A branch still at its fork point, with the default branch moved on above it.
    expect(
      placeholders(buildCommitGraph([commit('f', 'r'), commit('r')], base('f', true)))
    ).toEqual(['into', null])
  })

  it('draws nothing while the default branch is still where the branch forked', () => {
    expect(placeholders(buildCommitGraph(forked, base('f')))).toEqual([null, null, null, null])
  })

  it('draws nothing without a default branch', () => {
    expect(placeholders(buildCommitGraph(forked))).toEqual([null, null, null, null])
  })

  it('hands over to the real line where a merge of the default branch opens lane 0', () => {
    // m merged the default branch's t1 in; the default branch has moved on since.
    const graph = buildCommitGraph(
      [commit('m', 'b1', 't1'), commit('t1', 'f'), commit('b1', 'f'), commit('f')],
      base('t1', true)
    )

    expect(placeholders(graph)).toEqual(['through', null, null, null])
  })

  it('carries on down a page that has not reached the fork yet', () => {
    const graph = buildCommitGraph([commit('b2', 'b1'), commit('b1', 'f')], base('f', true))

    expect(placeholders(graph)).toEqual(['through', 'through'])
  })
})

describe('outEdgeColorLane', () => {
  // m merges s into the main line; both sides go back to the same root.
  const rows = buildCommitGraph([
    commit('m', 'a', 's'),
    commit('a', 'r'),
    commit('s', 'r'),
    commit('r')
  ]).rows

  it('colours an edge that continues a lane in that lane', () => {
    expect(outEdgeColorLane(rows[1], 0)).toBe(0)
  })

  it('colours an edge that opens a lane for a merged parent in the new lane', () => {
    expect(outEdgeColorLane(rows[0], 1)).toBe(1)
  })

  it('colours an edge that bends into an open lane in the node lane', () => {
    // s ends its branch by joining lane 0, but the edge is still part of lane 1.
    expect(outEdgeColorLane(rows[2], 0)).toBe(1)
  })
})

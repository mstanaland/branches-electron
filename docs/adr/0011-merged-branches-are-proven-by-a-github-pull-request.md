# Merged branches are proven by a GitHub pull request, found with the user's `gh`

A branch is a **merged branch** only when Branches can name the **pull request** that merged it: a merged PR on GitHub whose base is the repository's default branch, whose head branch name equals the name of the branch's **upstream** (gone or not), and whose head commit is the local tip or a descendant of it, when that commit is present locally. That one check is both necessary and sufficient. Git's own reachability check, the **gone** upstream, and merge-commit subjects are not consulted, and none of them can make a branch merged on its own. The MERGED badge and the History alert exist to clean up the leftovers of the common workflow, a branch pushed, reviewed and merged on GitHub. The PR is the evidence the user can check with one click, and it works the same for merge-commit, rebase and squash merges, because GitHub keeps the PR's head commit as the branch's original tip. Don't "improve" it by also accepting a locally reachable branch or a gone upstream.

Branches finds PRs by running the user's installed GitHub CLI: one `gh api graphql` query per repository, with one alias per branch, against the GitHub repository of the **remote** each branch tracks. It runs when a repository opens and after every background or manual fetch. Main caches the answer, so **Refresh** stays offline. With no usable `gh` (missing, logged out or offline), the feature is off and says nothing.

## Considered Options

- **Any one of several checks is enough**, as Tower appears to do: reachability, merged PR, merge-commit name and timestamp, gone upstream. Rejected because a gone upstream also follows a PR closed without merging, or a branch someone abandoned. Calling that "safe to delete" invites losing work.
- **All the checks must pass.** Rejected because a squash or rebase merge always fails git's reachability check, so the branches the feature exists for would never qualify.
- **Git reachability into the default branch as a second way in.** It catches local merges, but those have no PR to point at. A user who merges by hand cleans up by hand.
- **Merge-commit analysis by branch name and timestamp.** It means parsing human-written subjects and guessing. Real merge commits are covered by the PR anyway.
- **Calling the GitHub REST/GraphQL API directly.** Needs a token Branches would have to obtain and store. `gh` already holds the user's login, the same reasoning as ADR-0010.
- **`gh pr list --state merged --limit N`.** One call, but anything older than the newest N PRs is silently missed. Querying by head branch name is exact.
- **Supporting forks** (asking the parent repository too). Left out as an edge case. A fork's PR lives on a repository the branch doesn't track.

## Consequences

- This changes ADR-0009's position on squash merges. ADR-0009 rejected detecting them by patch-id. PR evidence is a different method, and it is what lets the Delete dialog show a calm "merged by #N" note in place of the danger alert. Deleting still goes through that dialog, and it still always forces.
- `gh` is a third kind of process main spawns. It lives in `src/main/github/` under the same rules as `src/main/git/` and `src/main/claude/`: `execFile` with an argument array, async only, and a typed error. AGENTS.md's process rule names it. It is found the way `claude` is (ADR-0010), with a `BRANCHES_GH_PATH` override.
- Branch names and the repository's identity go to GitHub through `gh`. That is the user's own hosting service and login, so there is no separate consent.
- The PR link opens through an `openExternal` API call that accepts only `https://` URLs taken from `gh`'s answers, never a URL the renderer builds.

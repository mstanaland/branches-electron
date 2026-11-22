# Branch deletion judges safety by branch-only commits, then always forces

Git's own safe delete, `git branch -d`, refuses a branch that isn't merged into its upstream, or into HEAD when it has none. That answers the wrong question for a GUI. A branch that was pushed but never merged passes, because its upstream has the commits. A branch already merged into the **default branch** fails when the user is on some other branch. And whatever the outcome, the user only gets git's yes or no, with no count to show. So **Delete branch** decides the risk itself. When the dialog opens, main counts the **branch-only commits**: commits reachable from the branch and from no other local branch, remote-tracking branch or tag. If the **upstream** is being deleted too, it no longer counts as somewhere else. The dialog warns according to that count, and once the user confirms, the branch is always deleted with `git branch -D`. There is no plain `-d` path, deliberately: don't "fix" it by trying `-d` first.

## Considered Options

- **Git's rule**: try `-d` and fall back to `-D` behind a warning. Rejected because of the mismatches above, and because the warning would depend on which branch HEAD is on.
- **Merged into the default branch**: rejected because it warns about branches whose commits are safe on another branch or tag, and misses nothing a reachability check would catch.
- **Detecting squash merges** (patch-id comparison against the default branch), so a squash-merged branch wouldn't warn at all: rejected as slow and unreliable. Instead, an upstream that is **gone** gets a calm note in place of the danger alert. Background fetch prunes the upstream's remote-tracking ref, so whether anything was committed after the upstream went can't be known. The note says that rather than guessing. (ADR-0011 later added squash-merge detection by a different route: a merged GitHub pull request, not patch-ids.)

## Consequences

Because confirming forces, the warning has to match what is actually deleted. The dialog passes back the oids it counted against. The local delete runs only if the branch is still at that oid, and the upstream delete uses `--force-with-lease` on the upstream's oid. If either has moved, nothing is deleted.

---
name: count-production-lines
description: Calculate exact added, deleted, and net non-comment production-line changes in a Git branch or patch.
---

# Count Production Lines

Use this skill when a user asks how many production-code lines a branch or
change adds or removes, especially when comments, tests, blank lines, or type
declarations must be handled explicitly.

## Workflow

1. Identify the comparison base. Prefer the pull request base or the explicit
   ref the user names; otherwise use `origin/master` when it exists and state
   the choice. Do not silently compare against an unrelated local branch.
2. Identify the scope and file policy. For a production-code count, exclude
   test files and usually count runtime source files only. Report declaration
   files separately unless the user explicitly includes them.
3. Run `scripts/count-production-lines.mjs` from the repository root. It uses
   the Git diff and the repository's TypeScript-aware parser to identify code
   tokens without treating comment markers inside strings, templates, or
   regular expressions as comments.
4. Report added, deleted, and net lines, plus the base ref, scope, and
   inclusion/exclusion rules. Include the declaration-inclusive figure when
   it could explain a discrepancy.

The script counts a line when it contains a non-comment parser token. This
excludes comment-only and blank lines while counting lines that contain both
code and a trailing comment. It reports changed lines directly from the patch;
do not substitute whole-file line totals. The comparison is against committed
`HEAD`, so unrelated working-tree edits do not affect the result.

Example:

```sh
node /Users/klavikka/.codex/skills/count-production-lines/scripts/count-production-lines.mjs \
  --base origin/master \
  --path packages/core/src \
  --extensions .js
```

Use `--include-tests` or `--include-declarations` only when requested. If the
change includes TypeScript or other syntax that the small lexer cannot safely
classify, say so and provide the affected files rather than presenting a false
precision result.

---
name: attach-pr-recording
description: Upload an existing screen recording as an inline video comment on a GitHub pull request using the GitHub CLI. Use when the user asks to attach or post a recording to a PR; recording capture is a separate task.
---

# Attach a recording to a pull request

Use GitHub's native video attachment so reviewers can play the recording inside
its PR comment. The connected GitHub tools can read and write comment text but
may not support uploading local media; use the CLI for that missing capability.
Posting requires the user's authorization. Drafting this skill or preparing a
recording does not authorize a comment.

## Check the target and CLI

- Confirm the repository, PR URL and local video. Inspect the recording or
  representative frames; describe the revision and behavior it actually shows.
- Check `gh pr comment --help` for `--attach`. Detect capability instead of
  assuming the installed version supports uploads.
- If missing, use an available newer CLI. Otherwise obtain an official release
  from `cli/cli` matching the machine's OS and architecture, verify its published
  checksum, and unpack it into a temporary directory. Use that binary directly;
  do not replace the system CLI or add a project dependency for this task.
- Reuse existing GitHub authentication. Use an explicit repository or PR URL so
  the current checkout cannot accidentally select another PR.

## Prepare and upload

Write the complete comment to a UTF-8 file. State what to watch and any relevant
before/after revisions. For larger work, identify the issue and this PR's slice.
A recording illustrates behavior; do not describe it as correctness or
performance proof unless the recording actually establishes that claim.

Put a standalone relative media reference where the player should appear:

```markdown
Before/after: master on the left, this PR on the right. Watch the fill remain
visible as the stroke fades.

![](./before-after.webm)

_Posted by Codex (AI agent) at the user's request._
```

Use the actual agent identity and follow the repository's attribution rules.
Keep the video reference before the attribution footer. Video has no alt text.

Pass both the comment file and the recording to the upload-capable CLI:

```sh
gh pr comment "$pr_url" --repo "$repo" \
    --body-file "$comment_file" --attach "$recording_file"
```

Set those variables to the verified PR, repository and absolute file paths.
The referenced filename must match the attachment. Paths in `--body-file` are
resolved relative to that file's directory, falling back to the working
directory. Keeping the comment and recording together avoids ambiguity.

`--attach` uploads the local video and rewrites the matching Markdown reference
to its GitHub attachment URL. An unreferenced attachment is appended at the end,
which can put it after the attribution footer. A local path alone, or a normal
comment API call containing it, does not upload the video.

## Verify and report

Read back the returned comment and confirm that its body contains a GitHub
attachment URL in place of the local reference. Open it when needed to verify
playback. Return the comment link to the user.

If the command fails with an uncertain outcome, inspect the PR comments before
retrying to avoid duplicate posts. To replace a previous recording, verify the
exact comment first; use `--edit-last` only when that comment is the current
user's latest comment. Do not edit an unrelated comment or remove an older
recording without authorization.

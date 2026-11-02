---
name: attach-pr-recording
description: Create PR demonstration videos or attach existing recordings to GitHub pull request descriptions and comments. Use for feature walkthroughs, bug reproductions, before/after comparisons, and requests to record or upload a PR demo.
---

# Record and attach a pull request demonstration

Support capture-only requests as well as uploads of existing browser, desktop,
or terminal recordings. Use GitHub's native video attachments for inline playback.
Recording a demonstration does not authorize uploading it; follow the user's
requested destination and existing authorization without asking again.

## Prepare the demonstration

- Identify the behavior and revision to show. For a comparison, label each
  revision clearly. Choose a short sequence that makes the change visible.
- Keep recordings and temporary demo scripts outside the repository unless the
  user requests committed media. Preserve the application's normal behavior,
  including tooltips; keep staging setup separate from product changes.
- If a recording already exists, inspect it or representative frames and proceed
  to upload when requested. Desktop and terminal capture can use the relevant
  capture tool; the browser helper below is optional.

## Capture a browser demonstration

Read [browser recording](references/browser-recording.md) when generating a new
browser video. The reusable [capture helper](scripts/recordBrowserDemo.mjs)
handles recording, an arrow cursor, smooth movement, optional captions and click
indicators, WebM encoding, preview frames, and browser cleanup.

The helper accepts a URL and callbacks. Keep application setup, readiness,
selectors, coordinates, assertions, and the action sequence in a small per-demo
script. Reuse a project's existing development server and testing utilities
where useful; the helper itself must remain independent of that project.

Inspect the encoded result before posting. Check that cursor targets, captions,
selected states, and any tooltip or animation being demonstrated are visible.
Capture-only tasks finish by returning the local video without changing a PR.

## Check the upload target and CLI

- Confirm the repository, PR URL, local video, and placement: PR description or
  comment. Prefer connected GitHub tools for reads and ordinary metadata edits;
  use the CLI when the connector cannot upload local media.
- Check `gh pr edit --help` or `gh pr comment --help` for `--attach`, matching
  the requested placement. Detect capability rather than assuming support.
- If missing, use an available newer CLI. Otherwise obtain an official release
  from `cli/cli` matching the machine's OS and architecture, verify its published
  checksum, and unpack it into a temporary directory. Use that binary directly;
  do not replace the system CLI or add a project dependency for this task.
- Reuse existing GitHub authentication. Use an explicit repository or PR URL so
  the current checkout cannot accidentally select another PR.

## Prepare and upload

Read the current PR description before replacing it, preserving relevant content.
Write the complete description or comment to a UTF-8 file. State what to watch
and any relevant before/after revisions. A recording illustrates behavior;
describe it as correctness or performance evidence only when it establishes that
claim. Follow the repository's attribution rules using the actual agent identity.

Put a standalone relative media reference where the player should appear:

```markdown
Before/after: master on the left, this PR on the right. Watch the details panel
retain its contents when the layout changes.

![](./before-after.webm)

_Posted by Codex (AI agent) at the user's request._
```

Video has no alt text. Keep its reference before any attribution footer. Keep
the text file beside the recording so relative paths resolve unambiguously.

For a PR description, pass both files to the upload-capable CLI:

```sh
gh pr edit "$pr_url" --repo "$repo" \
    --body-file "$body_file" --attach "$recording_file"
```

For a new comment, use `gh pr comment` with the same flags. Set the variables to
the verified PR, repository and absolute file paths. The referenced filename
must match the attachment.

`--attach` uploads the video and rewrites its Markdown reference to a GitHub
attachment URL. Unreferenced attachments are appended, potentially after the
footer. A local path alone, or a normal comment API call containing it, does not
upload the video.

## Verify and report

Read back the updated description or returned comment and confirm the GitHub
attachment URL replaced the local reference. Open it when needed to verify
playback. Return the PR or comment link and the local video when useful.

If an upload fails with an uncertain outcome, inspect the destination before
retrying to avoid duplicate posts. To replace a recording, verify the exact
location first; use `--edit-last` only for the current user's latest comment.
Preserve unrelated comments and recordings unless their removal is authorized.

---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

<!-- category: feature -->

Hide and show tracks in an embedded GenomeSpy visualization with
`ViewHandle.visibility`.

Hiding a track frees up space while keeping its loaded data and selections. Pass
saved visibility choices to `initialVisibilityOverrides` to apply them before
GenomeSpy lays out tracks or loads their data. In GenomeSpy App, the API and the
View settings menu use the same choices, and a URL bookmark takes precedence
over the host's choices when starting App in standalone mode.

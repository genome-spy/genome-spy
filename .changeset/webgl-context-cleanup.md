---
"@genome-spy/core": patch
---

<!-- category: fix -->

Release WebGL contexts when charts are finalized so replacing charts does not
unnecessarily exhaust the browser's context limit. Report context loss during
shader initialization clearly, and preserve compilation and linking failures
when the browser supplies no diagnostic text.

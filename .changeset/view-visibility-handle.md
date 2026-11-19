---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

<!-- category: feature -->

Hide and show views in an embedded GenomeSpy visualization with
`ViewHandle.visibility`.

Hidden views free up space and retain their loaded data and selections. Use
`initialVisibilityOverrides` to apply saved choices before the first layout and
data load. The API and View settings share choices in GenomeSpy App. Startup URL
bookmarks take precedence in standalone App.

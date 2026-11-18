---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

<!-- category: feature -->

Views and import sites can use a boolean parameter expression for `visible`.
For example, `span(domain('x')) < 10000` shows a sequence track when the viewport spans fewer than 10,000 bases.
Hiding a track reclaims its space and preserves its data and selections.
In the App, expression-controlled views follow their parameters when a bookmark
is restored. The View settings menu offers toggles for manually controlled tracks.

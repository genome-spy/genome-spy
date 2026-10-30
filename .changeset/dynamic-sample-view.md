---
"@genome-spy/core": patch
"@genome-spy/app": minor
---

<!-- category: feature -->

Keep GenomeSpy App open while inserting, removing, or replacing its sample cohort.
Replacement clears cohort metadata and history while preserving independent
annotation tracks and navigation. Controls and bookmark persistence follow the
attached cohort, with an explicit API for changing its bookmark context. Removed
or failed views release their keyboard handlers and retained readers before their
source URLs can be released.

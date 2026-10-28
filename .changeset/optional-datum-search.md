---
"@genome-spy/core": minor
"@genome-spy/app": patch
"@genome-spy/app-agent": patch
---

<!-- category: feature -->

Look up loaded searchable records through the optional `@genome-spy/core/search`
entry without navigating or copying the full dataset. Bounded results include
multiple loci, record-derived targets, and publication metadata for consumer-owned
suggestions. App uses the shared lookup with field-labelled examples that refresh
when opened after updates, retaining its navigation and sample-command policies.
App Agent uses the same lookup and refreshed field examples, with explicit
truncation metadata; coordinate parsing remains separate.

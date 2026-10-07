---
"@genome-spy/core": patch
---

Fix loading failures in GFF3, VCF, and Tabix TSV lazy data sources caused by
incompatible decompression dependencies. Preserve the existing `addChrPrefix`
behavior, including custom prefixes, without requiring changes to visualization
specifications.

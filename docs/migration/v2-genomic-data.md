# Migrating Genomic Data to GenomeSpy 2.0

GenomeSpy 2.0 standardizes the records produced by built-in genomic data
sources. Update expressions, transforms, scale domains, and tests that consume
the changed fields.

## Strand values

BED, BEDPE, BigBed, BAM, and GFF3 sources now publish symbolic strand values:

| Meaning | GenomeSpy 2.0 value |
| --- | --- |
| Forward strand | `"+"` |
| Reverse strand | `"-"` |
| Unknown or unstranded | `null` |

Replace numeric strand conditions throughout the dataflow:

```js
datum.strand == 1   // Before
datum.strand == "+" // GenomeSpy 2.0

datum.strand == -1  // Before
datum.strand == "-" // GenomeSpy 2.0

datum.strand == 0    // Before
datum.strand == null // GenomeSpy 2.0
```

Apply the same change to BEDPE's `strand1` and `strand2` fields. Nominal color
or shape encodings that merely group strand values usually need no changes,
but their scale domains may need updating.

See [issue #459](https://github.com/genome-spy/genome-spy/issues/459) for the
original change request.

## GFF3 records

The GFF3 source now emits zero-based, half-open coordinates and a simpler
hierarchy. Attributes are lowercase top-level fields, and child features are
direct objects under `subfeatures`.

| GenomeSpy 1.x | GenomeSpy 2.0 |
| --- | --- |
| `seq_id` | `chrom` |
| One-based `start` plus an encoding offset | Zero-based `start` without an offset |
| Closed `end` | Exclusive `end` |
| `child_features` nested arrays | `subfeatures` objects |
| `attributes.ID[0]` | `id` |
| `attributes.gene_name[0]` | `gene_name` |
| Other `attributes.*` paths | Lowercase top-level fields |

Singleton attributes are scalars, while repeated values remain arrays. An
attribute that collides with a parser field receives a numeric suffix. The
adapter reserves `chrom`, so a GFF3 attribute named `chrom` becomes `chrom2`,
or the next available `chromN` field.

Remove compatibility transforms that flatten the legacy outer arrays or copy
nested attributes. Flatten `subfeatures` only at the hierarchy levels the
visualization needs. Remove locus-encoding offsets previously used to correct
GFF3 `start` values.

See the [GFF3 source documentation](../grammar/data/lazy.md#gff3) and the
[GENCODE example](../examples/genomic-data/gencode-gff3-gene-annotations.md)
for the current record shape. See
[issue #460](https://github.com/genome-spy/genome-spy/issues/460) for the
original change request.

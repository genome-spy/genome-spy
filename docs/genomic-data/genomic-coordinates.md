# Genomic Coordinates

![Placeholder](../img/coordinate-linearization.svg){ align=right }

GenomeSpy can visualize genomic coordinates by concatenating chromosomes (or
other contigs) into one continuous axis. To do that, it needs contig sizes and
their preferred order. This information usually comes from a genome assembly.

A common setup is to define a default assembly at the top level with the
`assembly` property:

```json
{
  "assembly": "hg38",
  ...
}
```

If different axes use different coordinate systems (for example, synteny or
cross-species dot plots), set `assembly` separately in each locus scale:

```json
{
  "encoding": {
    "x": {
      "type": "locus",
      "scale": { "type": "locus", "assembly": "hg19" }
    },
    "y": {
      "type": "locus",
      "scale": { "type": "locus", "assembly": "hg38" }
    }
  }
}
```

When every locus scale sets `scale.assembly`, root `assembly` is optional.
Also, if root `assembly` is omitted and `genomes` has exactly one entry, that
single entry is used as the default assembly.

## Supported genomes

GenomeSpy bundles a few common built-in genome assemblies: `"hg38"`, `"hg19"`,
`"hg18"`, `"mm10"`, `"mm9"`, and `"dm6"`.

## Custom genomes

Reusable custom assemblies are defined under root `genomes`, which maps assembly
names to their configurations.

### As a `chrom.sizes` file

The `chrom.sizes` file is a two-column text file with the chromosome names and
their sizes. You may want to use the UCSC Genome Browser's
[fetchChromSizes](http://hgdownload.soe.ucsc.edu/admin/exe/linux.x86_64/fetchChromSizes)
script to download the sizes for a genome assembly. GenomeSpy does not filter
out any alternative contigs or haplotypes, so you may want to preprocess the
file before using it.

Example:

```json
{
  "genomes": {
    "myAssembly": {
      "url": "https://genomespy.app/data/genomes/hg19/chrom.sizes"
    }
  },
  "assembly": "myAssembly",
  ...
}
```

### Within the specification

You can provide a named genome definition directly in root `genomes` using the
`contigs` property. The contigs are an array of objects with the `name` and
`size` properties.

Example:

```json
{
  "genomes": {
    "dm6custom": {
      "contigs": [
        {"name": "chr3R", "size": 32079331 },
        {"name": "chr3L", "size": 28110227 },
        {"name": "chr2R", "size": 25286936 },
        {"name": "chrX",  "size": 23542271 },
        {"name": "chr2L", "size": 23513712 },
        {"name": "chrY",  "size": 3667352 },
        {"name": "chr4",  "size": 1348131 }
      ]
    }
  },
  "assembly": "dm6custom",
  ...
}
```

### Inline in `scale.assembly`

For one-off assemblies, you can define the assembly object directly in a locus
scale.

Inline objects are anonymous and must define exactly one of:

- `contigs`
- `url`

Example (`contigs` inline):

```json
{
  "mark": "point",
  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "pos",
      "type": "locus",
      "scale": {
        "type": "locus",
        "assembly": {
          "contigs": [
            { "name": "chr1", "size": 248956422 },
            { "name": "chr2", "size": 242193529 }
          ]
        }
      }
    }
  }
}
```

Example (`url` inline):

```json
{
  "mark": "point",
  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "pos",
      "type": "locus",
      "scale": {
        "type": "locus",
        "assembly": {
          "url": "https://genomespy.app/data/genomes/hg19/chrom.sizes"
        }
      }
    }
  }
}
```

If the same assembly is reused across multiple scales, define it once in root
`genomes` and reference it by name.

!!! note "Legacy root `genome`"

    Root `genome` is still supported for backward compatibility, but it is
    deprecated. Use `genomes` and `assembly` in new specifications.

## Encoding genomic coordinates

When an assembly can be resolved (from `scale.assembly` or root `assembly`), you
can encode genomic coordinates by specifying the chromosome (`chrom`) and
position (`pos`) fields as follows:

```json
{
  ...,
  "encoding": {
    "x": {
      "chrom": "Chr",
      "pos": "Pos",
      "offset": -1.0,
      "type": "locus"
    },
    ...
  }
}
```

The example above specifies that the _chromosome_ is read from the `"Chr"` field
and the _intra-chromosomal position_ from the `"Pos"` field. The `"locus"` data
type pairs the channel with a [`"locus"`](../grammar/scale.md#locus-scale)
scale, which provides a chromosome-aware axis. However, you can also use the
`field` property with the locus data type if the coordinate has already been
linearized. The `offset` property is explained [below](#coordinate-counting).

!!! note "What happens under the hood"

    When the `chrom` and `pos` properties are used used in channel definitions,
    GenomeSpy inserts an implicit
    [linearizeGenomicCoordinate](../grammar/transform/linearize-genomic-coordinate.md)
    transformation into the data flow. The transformation introduces a new
    field with the linearized coordinate for the (chromosome, position) pair.
    The channel definition is modified to use the new field.

    In some cases you may want to insert an explicit transformation to the data
    flow to have better control on its behavior.

## Coordinate counting

The `offset` property allows for aligning and adjusting for different coordinate
notations: zero or one based, closed or half-open. The offset is added to the
final coordinate.

GenomeSpy's [`"locus"`](../grammar/scale.md#locus-scale) scale expects
**half-open**, **zero-based** coordinates.

Read more about coordinates at the [UCSC Genome Browser
Blog](https://genome-blog.gi.ucsc.edu/blog/2016/12/12/the-ucsc-genome-browser-coordinate-counting-systems/).

## Examples

### Point features

Point features cover a single position on a chromosome. An example of a point
feature is a single nucleotide variant (SNV), where a nucleotide has been
replaced by another.

<div><genome-spy-doc-embed height="80">

```json
{
  "assembly": "hg38",
  "data": {
    "values": [
      { "chrom": "chr3", "pos": 134567890 },
      { "chrom": "chr4", "pos": 123456789 },
      { "chrom": "chr9", "pos": 34567890 }
    ]
  },
  "mark": "point",
  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "pos",
      "type": "locus"
    }
  }
}
```

</genome-spy-doc-embed></div>

### Segment features

Segment features cover a range of positions on a chromosome. They are defined by
their two end positions. An example of a segment feature is a copy number
variant (CNV), where a region of the genome has been duplicated or deleted.

<div><genome-spy-doc-embed height="80">

```json
{
  "assembly": "hg38",
  "data": {
    "values": [
      { "chrom": "chr3", "startpos": 100000000, "endpos": 140000000 },
      { "chrom": "chr4", "startpos": 70000000, "endpos": 170000000 },
      { "chrom": "chr9", "startpos": 50000000, "endpos": 70000000 }
    ]
  },
  "mark": "rect",
  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "startpos",
      "type": "locus"
    },
    "x2": {
      "chrom": "chrom",
      "pos": "endpos"
    }
  }
}
```

</genome-spy-doc-embed></div>

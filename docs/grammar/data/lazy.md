# Lazy Data Sources

_Lazy_ data sources load data on-demand in response to user interactions. Unlike
[eager](eager.md) sources, most lazy data sources support indexing, which offers
the capability to retrieve and load data partially and incrementally, as users
navigate the genome. This is especially useful for very large datasets that are
infeasible to load in their entirety.

!!! note "How it works"

    Lazy data sources observe the scale domains of the view where the data
    source is specified. When the domain changes as a result of an user interaction,
    the data source invokes a request to fetch a new subset of the data. Lazy
    sources need the visual `channel` to be specified, which is used to determine the
    scale to observe. For genomic data sources, the channel defaults to `"x"`.

Lazy data sources are specified using the `lazy` property of the `data` object.
Unlike in eager data, the `type` of the data source must be specified explicitly:

```json title="Example: Specifiying a lazy data source"
{
  "data": {
    "lazy": {
      "type": "bigwig",
      "url": "https://data.genomespy.app/genomes/hg38/hg38.gc5Base.bw"
    }
  },
  ...
}
```

## Indexed FASTA

The `"indexedFasta"` source enable fast random access to a reference sequence.
It loads the sequence as three consecutive chuncks that cover and flank the
currently visible region (domain), allowing the user to rapidly pan the view.
The chunks are provided as data objects with the following fields: `chrom`
(string), `start` (integer), and `sequence` (a string of bases).

### Parameters

SCHEMA IndexedFastaData

### Example

The visualization below shows how to specify a sequence track using an indexed FASTA
file. The sequence chunks are split into separate data objects using the
[`"flattenSequence"`](../transform/flatten-sequence.md) transform, and the final
position of each nucleotide is computed using the
[`"formula"`](../transform/formula.md) transform. Please note that new data are
fetched only when the user zooms into a region smaller than the window size
(default: 7000 bp).

EXAMPLE examples/docs/grammar/data/lazy/indexed-fasta-sequence-track.json height=60 spechidden

!!! disclaimer ""

    The visualization uses a mirrored, indexed copy of UCSC's hg38 / GRCh38
    reference FASTA from
    [goldenPath/hg38/bigZips/latest/hg38.fa.gz](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/latest/hg38.fa.gz).
    UCSC states that its downloadable data files and database tables are freely
    available for public and commercial use, subject to any upstream
    restrictions noted for the original assembly data.

The data source is based on [GMOD](http://gmod.org/)'s
[indexedfasta-js](https://github.com/GMOD/indexedfasta-js) library.

## BigWig

The `"bigwig"` source enables the retrieval of dense, continuous data, such as
coverage or other signal data stored in BigWig files. It behaves similarly to
the indexed FASTA source, loading the data in chunks that cover and flank the
currently visible region. However, the window size automatically adapts to the
zoom level, and data are fetched in higher resolution when zooming in. The data
source provides data objects with the following fields: `chrom` (string),
`start` (integer), `end` (integer), and `score` (number).

### Parameters

SCHEMA BigWigData

### Example

The visualization below shows the GC content of the human genome in 5-base windows.
When you zoom in, the resolution of the data automatically increases.

EXAMPLE examples/docs/grammar/data/lazy/bigwig-gc-content.json height=120 spechidden

!!! disclaimer ""

    The visualization uses UCSC's hg38 GC Percent in 5-base windows track,
    distributed as
    [goldenPath/hg38/bigZips/latest/hg38.gc5Base.bw](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/latest/hg38.gc5Base.bw).
    UCSC states that its downloadable data files and database tables are freely
    available for public and commercial use.

The data source is based on [GMOD](http://gmod.org/)'s
[bbi-js](https://github.com/GMOD/bbi-js) library.

## BigBed

The `"bigbed"` source enables the retrieval of segmented data, such as annotated
genomic regions stored in BigBed files.

### Parameters

SCHEMA BigBedData

### Example

The visualization below displays the "ENCODE Candidate Cis-Regulatory Elements (cCREs) combined from all cell types" dataset for the hg38 genome.

EXAMPLE examples/docs/grammar/data/lazy/bigbed-ccre-track.json height=70 spechidden

!!! disclaimer ""

    The visualization uses the ENCODE Registry of candidate cis-Regulatory
    Elements (cCREs), distributed by UCSC as
    [gbdb/hg38/encode3/ccre/encodeCcreCombined.bb](https://hgdownload.soe.ucsc.edu/gbdb/hg38/encode3/ccre/encodeCcreCombined.bb);
    see ENCODE Encyclopedia Version 2: [Genomic and Transcriptomic
    Annotations](https://www.encodeproject.org/data/annotations/). ENCODE data
    may be freely downloaded, analyzed, and published without restriction, and
    UCSC also states that its downloadable data files are freely available for
    public and commercial use.

The data source is based on [GMOD](http://gmod.org/)'s
[bbi-js](https://github.com/GMOD/bbi-js) library.

## Tabix TSV

The `"tabix"` source enables the retrieval of tab-separated records stored in
a bgzip-compressed, tabix-indexed file. It returns plain objects using the
field names from `columns`, from a commented header line in the tabix file
header, or from the first row of a plain TSV header. Field types are inferred
automatically unless you provide `parse` (see [eager data sources](eager.md#tabular-formats)
for the supported syntax). If the file uses bare chromosome names, set
`addChrPrefix` to `true` to align them with GenomeSpy's UCSC-style genomes.

### Parameters

SCHEMA TabixTsvData

## VCF

The tabix-based `"vcf"` source enables the retrieval of variant data stored in
VCF files. The object format GenomeSpy uses is described in
[vcf-js](https://github.com/GMOD/vcf-js/tree/master?tab=readme-ov-file#methods)'s
documentation.

### Parameters

SCHEMA VcfData

### Example

The visualization below replicates the small-variant classification view
described in NCBI's
["New ClinVar graphical display"](https://ncbiinsights.ncbi.nlm.nih.gov/2022/08/30/clinvar-graphical-view/)
post. It places ClinVar variants by genomic position and germline
classification and uses color to distinguish the classification categories.

EXAMPLE examples/docs/grammar/data/lazy/vcf-clinvar.json height=100 spechidden

!!! disclaimer ""

    The visualization uses a mirrored copy of the ClinVar GRCh38 VCF release
    from NCBI's
    [ClinVar FTP downloads](https://www.ncbi.nlm.nih.gov/clinvar/docs/maintenance_use/).
    ClinVar asks that redistributed data be attributed to ClinVar as the data
    source.

The data source is based on [GMOD](http://gmod.org/)'s
[vcf-js](https://github.com/GMOD/vcf-js) library.

## GFF3

The tabix-based `"gff3"` source enables the retrieval of hierarchical data, such
as genomic annotations stored in GFF3 files. The object format GenomeSpy uses
is described in [gff-js](https://github.com/GMOD/gff-js#object-format)'s
documentation. The [flatten](../transform/flatten.md) and
[project](../transform/project.md) transforms are useful when extracting the
child features and attributes from the hierarchical data structure. See the
visualization below.

### Parameters

SCHEMA Gff3Data

### Example

The visualization below displays the human (GRCh38.p13)
[GENCODE](https://www.gencodegenes.org/) v43 annotation dataset. Please note
that the example shows a maximum of ten overlapping features per locus as
vertical scrolling is currently not supported properly.

EXAMPLE examples/docs/grammar/data/lazy/gff3-gene-annotations.json height=360 spechidden

!!! disclaimer ""

    The visualization uses a sorted and bgzip-compressed copy of the GENCODE
    human [release 43 (GRCh38.p13) comprehensive gene annotation
    GFF3](https://www.gencodegenes.org/human/release_43.html). GENCODE states
    that all project data are open access.

The data source is based on [GMOD](http://gmod.org/)'s
[tabix-js](https://github.com/GMOD/tabix-js) and [gff-js](https://github.com/GMOD/gff-js) libraries.

## BAM

The `"bam"` source is very much work in progress but has a low priority. It
currently exposes the reads but provides no handling for variants alleles,
CIGARs, etc. Please send a message to [GitHub
Discussions](https://github.com/genome-spy/genome-spy/discussions) if you are
interested in this feature.

### Parameters

SCHEMA BamData

### Example

EXAMPLE examples/docs/grammar/data/lazy/bam-read-alignments.json height=350 spechidden

!!! disclaimer ""

    The visualization uses a mirrored copy of UCSC's
    [bamExample.bam](http://genome.ucsc.edu/goldenPath/help/examples/bamExample.bam),
    which the UCSC BAM format documentation describes as 1000 Genomes read
    alignments for individual NA12878 on hg18. UCSC states that its downloadable
    data files are freely available for public and commercial use, and the
    underlying 1000 Genomes / IGSR data are also openly available.

The data source is based on [GMOD](http://gmod.org/)'s
[bam-js](https://github.com/GMOD/bam-js) library.

## Axis ticks

The `"axisTicks"` data source generates a set of ticks for the specified channel.
While GenomeSpy internally uses this data source for generating axis ticks, you
also have the flexibility to employ it for creating fully customized axes
according to your requirements. The data source generates data objects with
`value` and `label` fields.

### Parameters

SCHEMA AxisTicksData

### Example

The visualization below generates approximately three ticks for the `x` axis.

EXAMPLE examples/docs/grammar/data/lazy/axis-ticks.json height=80 spechidden

## Axis genome

The `axisGenome` data source, in fact, does not dynamically update data.
However, it provides a convenient access to the genome (chromosomes) of the
given channel, allowing creation of customized chromosome ticks or annotations.
The data source generates data objects with the following fields: `name`, `size`
(in bp), `continuousStart` (linearized coordinate), `continuousEnd`, `odd`
(boolean), and `number` (1-based index).

### Parameters

SCHEMA AxisGenomeData

### Example

EXAMPLE examples/docs/grammar/data/lazy/axis-genome.json height=150 spechidden

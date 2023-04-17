import { embed } from "@genome-spy/core";

import { IndexedFasta } from "@gmod/indexedfasta";
import { RemoteFile } from "generic-filehandle";

import { Buffer } from "buffer";

// Hack needed by @gmod/indexedfasta
// TODO: Submit a PR to @gmod/indexedfasta to make this unnecessary
window.Buffer = Buffer;

// Use IGV's fasta files for testing
const fasta = new IndexedFasta({
    fasta: new RemoteFile(
        "https://igv-genepattern-org.s3.amazonaws.com/genomes/seq/hg19/hg19.fasta"
    ),
    fai: new RemoteFile(
        "https://igv-genepattern-org.s3.amazonaws.com/genomes/seq/hg19/hg19.fasta.fai"
    ),
});

/** @type {import("@genome-spy/core/spec/root").RootSpec} */
const spec = {
    height: 30,

    genome: {
        name: "hg19",
    },

    layer: [
        {
            opacity: {
                unitsPerPixel: [5, 8],
                values: [0, 0.5],
            },
            data: { values: [{}] },
            mark: {
                type: "text",
                text: "Zoom in to see the reference sequence",
            },
        },
        {
            opacity: {
                unitsPerPixel: [8, 5],
                values: [0, 1],
            },
            data: {
                name: "fasta",
            },
            transform: [
                {
                    type: "flattenSequence",
                    field: "sequence",
                    as: ["rawPos", "base"],
                },
                {
                    type: "formula",
                    expr: "datum.rawPos + datum.start",
                    as: "pos",
                },
            ],
            encoding: {
                color: {
                    field: "base",
                    type: "nominal",
                    scale: {
                        type: "ordinal",
                        domain: ["A", "C", "T", "G", "N"],
                        range: [
                            "#7BD56C",
                            "#FF9B9B",
                            "#86BBF1",
                            "#FFC56C",
                            "#E0E0E0",
                        ],
                    },
                },
                x: {
                    chrom: "chrom",
                    pos: "pos",
                    type: "locus",
                    scale: { name: "genomeScale" },
                },
            },
            layer: [
                {
                    mark: {
                        type: "rect",
                        minWidth: 0.5,
                        minOpacity: 0.2,
                        tooltip: null,
                    },
                },
                {
                    mark: {
                        type: "text",
                        size: 13,
                        fitToBand: true,
                        paddingX: 1.5,
                        paddingY: 1,
                        opacity: 0.7,
                        tooltip: null,
                    },
                    encoding: {
                        color: { value: "black" },
                        text: { field: "base" },
                    },
                },
            ],
        },
    ],
};

const container = document.getElementById("container");

const api = await embed(container, spec);

/**
 *
 * @param {string} seqName
 * @param {number} start
 * @param {number} end
 */
async function getSequence(seqName, start, end) {
    const sequence = await fasta.getSequence(seqName, start, end);
    return {
        chrom: seqName,
        start,
        sequence,
    };
}

const genomeScale = api.getScaleResolutionByName("genomeScale");

genomeScale.addEventListener("domain", (event) => {
    handleDomainChange(
        event.scaleResolution.getDomain(),
        /** @type {import("@genome-spy/core/spec/genome").ChromosomalLocus[]} */ (
            event.scaleResolution.getComplexDomain()
        )
    );
});

const windowSize = 7000;

/**
 * @type {import("@genome-spy/core/spec/genome").ChromosomalLocus[]}
 */
let lastQuantizedDomain;

/**
 * Listen to the domain change event and update data when the covered windows change.
 *
 * @param {number[]} domain Linearized domain
 * @param {import("@genome-spy/core/spec/genome").ChromosomalLocus[]} complexDomain Chrom/Pos domain
 */
async function handleDomainChange(domain, complexDomain) {
    // Note: window size must be smaller than the largest chromosome.
    // In other words, the domain can comprise the maximum of 2 chromosomes.
    if (domain[1] - domain[0] > windowSize) {
        return;
    }

    const uniqueChroms = [...new Set(complexDomain.map((d) => d.chrom))];
    const firstChrom = uniqueChroms.at(0);
    const lastChrom = uniqueChroms.at(-1);

    const [start, end] = complexDomain;

    // We get three consecutive windows
    const startPos = Math.floor(start.pos / windowSize - 1) * windowSize;
    const endPos = Math.ceil(end.pos / windowSize + 1) * windowSize;

    const quantizedDomain = [
        { chrom: firstChrom, pos: startPos },
        { chrom: lastChrom, pos: endPos },
    ];

    if (isIdenticalDomain(lastQuantizedDomain, quantizedDomain)) {
        return;
    }

    lastQuantizedDomain = quantizedDomain;

    // Handle two cases: 1) Domain is within one chromosome, 2) Domain spans two chromosomes
    const sequences =
        uniqueChroms.length == 1
            ? [getSequence(firstChrom, Math.max(0, startPos), endPos)]
            : [
                  getSequence(
                      firstChrom,
                      Math.max(0, startPos),
                      startPos + 3 * windowSize
                  ),
                  getSequence(
                      lastChrom,
                      Math.max(0, endPos - 3 * windowSize),
                      endPos
                  ),
              ];

    api.updateNamedData("fasta", await Promise.all(sequences));
}

/**
 * @param {import("@genome-spy/core/spec/genome").ChromosomalLocus[]} domain1
 * @param {import("@genome-spy/core/spec/genome").ChromosomalLocus[]} domain2
 */
function isIdenticalDomain(domain1, domain2) {
    return (
        domain1 &&
        domain2 &&
        domain1.length == domain2.length &&
        domain1.every(
            (d, i) => d.chrom == domain2[i].chrom && d.pos == domain2[i].pos
        )
    );
}

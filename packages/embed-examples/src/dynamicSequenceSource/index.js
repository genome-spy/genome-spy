import { embed } from "@genome-spy/core/minimal";

// WARNING: This example temporarily imports an internal GenomeSpy class to
// convert quantized linear intervals into chromosome-specific intervals.
// TODO: Expose genome metadata and interval windowing through the stable
// embedding API, then remove this internal import.
import Genome from "@genome-spy/core/genome/genome.js";
import "@genome-spy/core/rendering/webgl.js";

import { getFakeSequence } from "./fakeSequenceSource.js";
import { hasWindowCoverageChanged, quantizeInterval } from "./windowing.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    datasets: {
        sequence: [],
    },
    height: 30,

    assembly: "hg19",

    stops: [8],

    multiscale: [
        {
            data: { values: [{}] },
            mark: {
                type: "text",
                text: "Zoom in to see the reference sequence",
            },
        },
        {
            data: {
                name: "sequence",
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
const domainStatus = document.getElementById("domain");

const api = await embed(container, spec);

const genomeScale = api.getScaleResolutionByName("genomeScale");
if (!genomeScale) {
    throw new Error("Missing named scale: genomeScale");
}

const genome = new Genome({ name: "hg19" });

genomeScale.addEventListener("domain", (event) => {
    void handleDomainChange(event.scaleResolution.getDomain());
});

const windowSize = 7000;

/**
 * @type {number[] | undefined}
 */
let lastQuantizedInterval;

/**
 * Listen to the domain change event and update data when the covered windows change.
 *
 * @param {number[]} domain Linearized domain
 */
async function handleDomainChange(domain) {
    if (domain[1] - domain[0] > windowSize) {
        domainStatus.textContent =
            "Zoom in to request a sequence window from the external source.";
        return;
    }

    const quantizedInterval = quantizeInterval(
        domain,
        windowSize,
        genome.totalSize
    );

    if (!hasWindowCoverageChanged(quantizedInterval, lastQuantizedInterval)) {
        return;
    }

    lastQuantizedInterval = quantizedInterval;

    const intervals =
        genome.continuousToDiscreteChromosomeIntervals(quantizedInterval);
    const sequences = intervals.map(({ chrom, startPos, endPos }) =>
        getFakeSequence(chrom, startPos, endPos)
    );

    api.datasets.set("sequence", await Promise.all(sequences));
    domainStatus.textContent = `External source updated for ${genome.formatInterval(quantizedInterval)}.`;
}

import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @typedef {"A" | "C" | "G" | "T"} Base */

const BASES = /** @type {const} */ (["A", "C", "G", "T"]);
const start = 100_000;

/** @type {{ index: number, chrom: string, pos: number, base: Base }[]} */
const sequence = Array.from({ length: 50 }, (_, index) => ({
    index,
    chrom: "chr1",
    pos: start + index,
    base: BASES[Math.floor(Math.random() * BASES.length)],
}));

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    datasets: { sequence },
    assembly: "hg19",
    layer: [
        {
            name: "sequence",
            layer: [
                {
                    name: "base-rects",
                    data: { name: "sequence" },
                    height: 70,
                    mark: {
                        type: "rect",
                        minWidth: 0.5,
                        minOpacity: 0.2,
                        tooltip: false,
                    },
                    encoding: {
                        x: {
                            chrom: "chrom",
                            pos: "pos",
                            type: "locus",
                            scale: {
                                domain: [
                                    { chrom: "chr1", pos: start },
                                    {
                                        chrom: "chr1",
                                        pos: start + sequence.length,
                                    },
                                ],
                            },
                        },
                        color: {
                            field: "base",
                            type: "nominal",
                            scale: {
                                type: "ordinal",
                                domain: BASES,
                                range: [
                                    "#7BD56C",
                                    "#86BBF1",
                                    "#FFC56C",
                                    "#FF9B9B",
                                ],
                            },
                        },
                    },
                },
                {
                    name: "base-labels",
                    data: { name: "sequence" },
                    height: 70,
                    mark: {
                        type: "text",
                        size: 13,
                        fitToBand: true,
                        paddingX: 1.5,
                        paddingY: 1,
                        opacity: 0.7,
                        tooltip: false,
                    },
                    encoding: {
                        x: {
                            chrom: "chrom",
                            pos: "pos",
                            type: "locus",
                            scale: {
                                domain: [
                                    { chrom: "chr1", pos: start },
                                    {
                                        chrom: "chr1",
                                        pos: start + sequence.length,
                                    },
                                ],
                            },
                        },
                        color: { value: "black" },
                        text: { field: "base" },
                    },
                },
            ],
        },
    ],
};

const container = document.getElementById("container");
const status = /** @type {HTMLParagraphElement} */ (
    document.getElementById("status")
);
const api = await embed(container, spec);
const marks = api.views.get({ scope: [], view: "sequence" }).marks;

/**
 * @param {{ hit: import("@genome-spy/core/types/embedApi.js").MarkHit }} event
 */
function editBase({ hit }) {
    const index = hit.datum.index;
    if (typeof index !== "number") {
        throw new Error("Clicked sequence base is missing its index.");
    }

    const base = sequence[index];
    if (!base) {
        throw new Error(`Clicked sequence index is out of range: ${index}`);
    }

    const nextBase = BASES[(BASES.indexOf(base.base) + 1) % BASES.length];
    base.base = nextBase;
    api.datasets.set("sequence", sequence);
    status.textContent = `Base ${index + 1} changed to ${nextBase}.`;
}

api.events.subscribe("click", async ({ point }) => {
    const result = await marks.pick(point);
    if (result.status === "hit") {
        editBase(result);
    }
});

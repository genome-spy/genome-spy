import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @typedef {"A" | "C" | "G" | "T"} Base */

const BASES = /** @type {Base[]} */ (["A", "C", "G", "T"]);
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
    assembly: "hg38",
    height: 50,

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
    },

    layer: [
        {
            name: "sequence",
            layer: [
                {
                    name: "base-rects",
                    data: { name: "sequence" },
                    mark: {
                        type: "rect",
                        tooltip: false,
                    },
                    encoding: {
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
                        color: { value: "black" },
                        text: { field: "base" },
                    },
                },
            ],
        },
    ],
};

const status = /** @type {HTMLParagraphElement} */ (
    document.getElementById("status")
);

const api = await embed(document.getElementById("container"), spec);
const marks = api.views.get({ scope: [], view: "sequence" }).marks;

marks.subscribe("click", ({ hit }) => {
    const index = /** @type {number} */ (hit.datum.index);
    const base = sequence[index];
    const nextBase = BASES[(BASES.indexOf(base.base) + 1) % BASES.length];
    base.base = nextBase;
    api.datasets.set("sequence", sequence);
    status.textContent = `Base ${index + 1} changed to ${nextBase}.`;
});

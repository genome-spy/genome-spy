import { embed } from "@genome-spy/core/index.js";

// --- https://github.com/genome-spy/genome-spy/issues/155
//import { embed } from "@genome-spy/core";

/** @type {import("@genome-spy/core/spec/root").RootSpec} */
const spec = {
    height: 250,
    width: 250,
    view: { stroke: "lightgray" },
    encoding: {
        x: {
            field: "x",
            type: "ordinal",
            scale: {
                // Has to be specified explicitly for now. There seems to
                // be a bug in dynamically updated catagorical scales.
                domain: ["point", "rect", "rule"],
            },
            axis: {
                minExtent: 40,
            },
        },
        y: {
            field: "y",
            type: "quantitative",
            axis: {
                grid: true,
            },
        },
    },
    layer: [
        {
            data: { name: "point" },
            mark: "point",
        },
        {
            data: { name: "rect" },
            mark: "rect",
        },
        {
            data: { name: "rule" },
            mark: {
                type: "rule",
                size: 5,
            },
        },
    ],
};

const container = document.getElementById("container");

const api = await embed(container, spec);

document
    .querySelectorAll("input[type='range']")
    .forEach((/** @type {HTMLInputElement}*/ input) => {
        input.addEventListener("input", () => {
            api.updateNamedData(input.name, [
                { x: input.name, y: input.value },
            ]);
        });
        api.updateNamedData(input.name, [{ x: input.name, y: input.value }]);
    });

import { embed, intervalSelection } from "@genome-spy/core/minimal";

/**
 * @typedef {import("@genome-spy/core/types/selectionTypes.js").IntervalSelection} IntervalSelection
 * @typedef {import("@genome-spy/core/spec/root.js").RootSpec} RootSpec
 */

const values = Array.from({ length: 101 }, (_, x) => ({
    x,
    y: Math.sin(x / 7) * 20 + Math.cos(x / 13) * 12 + 50,
}));

/** @type {RootSpec} */
const overviewSpec = {
    params: [
        {
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        },
    ],
    data: { values },
    height: 90,
    mark: { type: "point", size: 35, opacity: 0.75 },
    encoding: {
        x: {
            field: "x",
            type: "quantitative",
            scale: {
                domain: [0, 100],
                zoom: false,
            },
        },
        y: {
            field: "y",
            type: "quantitative",
            scale: { zero: false },
            axis: null,
        },
        color: {
            condition: {
                param: "brush",
                field: "y",
                type: "quantitative",
            },
            value: "lightgray",
        },
    },
};

/** @type {RootSpec} */
const detailSpec = {
    data: { values },
    height: 180,
    mark: { type: "point", size: 35 },
    encoding: {
        x: {
            field: "x",
            type: "quantitative",
            scale: {
                domain: [0, 100],
                name: "detailScale",
                zoom: true,
            },
        },
        y: {
            field: "y",
            type: "quantitative",
            scale: { zero: false },
        },
    },
};

const overviewContainer = document.getElementById("overview");
const detailContainer = document.getElementById("detail");
const resetButton = document.getElementById("reset");

const [overviewApi, detailApi] = await Promise.all([
    embed(overviewContainer, overviewSpec),
    embed(detailContainer, detailSpec),
]);

/** @type {import("@genome-spy/core/types/embedApi.js").ParamApi<IntervalSelection>} */
const brush = overviewApi.getParam("brush");
const detailScale = detailApi.getScaleResolutionByName("detailScale");
if (!detailScale) {
    throw new Error("Missing named scale: detailScale");
}

brush.subscribe((value) => {
    // This illustrates a simple one-way linking example.
    // You can implement more complex interactions by subscribing to multiple
    // parameters and/or scales and writing custom logic in the callback.
    // See `LinkingManager` in `linkedEmbeds.js` for inspiration.
    const interval = value.intervals.x;
    if (interval) {
        void detailScale.zoomTo(interval);
    } else {
        void detailScale.zoomTo([0, 100]);
    }
});

resetButton.addEventListener("click", () => {
    brush.setValue(intervalSelection({ x: null }));
});

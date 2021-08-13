import { createAndInitialize } from "./testUtils";
import createDomain, { toRegularArray as r } from "../utils/domainArray";
import LayerView from "./layerView";
import UnitView from "./unitView";

/** @type {import("../spec/view").LayerSpec} */
const spec = {
    data: { values: [] },
    layer: [
        {
            mark: "point",
            encoding: {
                x: { field: "a", type: "quantitative" },
                y: {
                    field: "a",
                    type: "quantitative",
                    scale: { domain: [1, 2] }
                },
                color: { value: "red" }
            }
        },
        {
            mark: "point",
            encoding: {
                x: { field: "a", type: "quantitative" },
                y: {
                    field: "b",
                    type: "quantitative",
                    scale: { domain: [4, 5] }
                },
                color: { value: "green" }
            }
        }
    ]
};

describe("Scales resolve with with non-trivial hierarchy", () => {
    /** @param {import("./view").default} view */
    const d = view =>
        view
            .getScaleResolution("y")
            .getScale()
            .domain();

    test("Scales (domains) are shared and merged by default on layers", async () => {
        const view = await createAndInitialize(spec, LayerView);

        expect(r(d(view))).toEqual([1, 5]);
        expect(r(d(view.children[0]))).toEqual([1, 5]);
        expect(r(d(view.children[1]))).toEqual([1, 5]);
    });

    test("Independent scales (domains) are not pulled up", async () => {
        const independentSpec = {
            ...spec,
            resolve: {
                scale: { y: "independent" },
                // TODO: independent scales should imply independent axes
                axis: { y: "independent" }
            }
        };

        const view = await createAndInitialize(independentSpec, LayerView);
        expect(view.getScaleResolution("y")).toBeUndefined();
        expect(r(d(view.children[0]))).toEqual([1, 2]);
        expect(r(d(view.children[1]))).toEqual([4, 5]);
    });

    test("Channels with just values (no fields or scales) do not resolve", async () => {
        const view = await createAndInitialize(spec, LayerView);
        expect(view.getScaleResolution("color")).toBeUndefined();
    });
});

describe("Domain handling", () => {
    test("Channels with quantitative fields include zero in their scale domain by default", async () => {
        const view = await createAndInitialize(
            {
                data: { values: [2, 3] },
                mark: "point",
                encoding: {
                    x: { field: "data", type: "quantitative" },
                    y: { field: "data", type: "quantitative" }
                }
            },
            UnitView
        );

        for (const channel of ["x", "y"]) {
            // Extract domain from data
            view.getScaleResolution(channel).reconfigure();
        }

        const d = /** @param {string} channel*/ channel =>
            view
                .getScaleResolution(channel)
                .getScale()
                .domain();

        expect(d("x")).toEqual([0, 3]);
        expect(d("y")).toEqual([0, 3]);
    });

    test("Channels with quantitative fields do not include zero in their scale domain if the domain has been defined explicitly", async () => {
        const view = await createAndInitialize(
            {
                data: { values: [2, 3] },
                mark: "point",
                encoding: {
                    x: {
                        field: "data",
                        type: "quantitative",
                        scale: { domain: [1, 4] }
                    },
                    y: {
                        field: "data",
                        type: "quantitative",
                        scale: { domain: [1, 4] }
                    }
                }
            },
            UnitView
        );

        const d = /** @param {string} channel*/ channel =>
            view
                .getScaleResolution(channel)
                .getScale()
                .domain();

        expect(d("x")).toEqual([1, 4]);
        expect(d("x")).toEqual([1, 4]);
    });

    test("Channels with quantitative fields do not include zero in their scale domain if zero is explicitly false", async () => {
        const view = await createAndInitialize(
            {
                data: { values: [2, 3] },
                mark: "point",
                encoding: {
                    x: {
                        field: "data",
                        type: "quantitative",
                        scale: { zero: false }
                    },
                    y: {
                        field: "data",
                        type: "quantitative",
                        scale: { zero: false }
                    }
                }
            },
            UnitView
        );

        for (const channel of ["x", "y"]) {
            // Extract domain from data
            view.getScaleResolution(channel).reconfigure();
        }

        const d = /** @param {string} channel*/ channel =>
            view
                .getScaleResolution(channel)
                .getScale()
                .domain();

        expect(d("x")).toEqual([2, 3]);
        expect(d("y")).toEqual([2, 3]);
    });
});

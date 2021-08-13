import { createAndInitialize } from "./testUtils";
import createDomain, { toRegularArray as r } from "../utils/domainArray";
import LayerView from "./layerView";
import UnitView from "./unitView";

// NOTE: The most of these tests don't actually test scaleResolution but the resolution algorithm.

describe("Scale resolution", () => {
    test("Channels with just values (no fields or scales) do not resolve", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },

            resolve: {
                scale: { x: "shared" }
            },

            layer: [
                {
                    mark: "point",
                    encoding: {
                        color: { value: "red" }
                    }
                },
                {
                    mark: "point",
                    encoding: {
                        color: { value: "green" }
                    }
                }
            ]
        };
        const view = await createAndInitialize(spec, LayerView);
        expect(view.children[0].getScaleResolution("color")).toBeUndefined();
        expect(view.children[1].getScaleResolution("color")).toBeUndefined();
    });

    test("Deeply shared scales are shared", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" }
            },

            resolve: { scale: { x: "shared" } },

            layer: [
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }]
                },
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }]
                }
            ]
        };

        const view = await createAndInitialize(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
    });

    test("Shared branches under an independent branch works as expected", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" }
            },

            resolve: {
                scale: { x: "independent" },
                // TODO: Axis should be set independent implicitly
                axis: { x: "independent" }
            },

            layer: [
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }]
                },
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }]
                }
            ]
        };

        const view = await createAndInitialize(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).not.toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
        expect(view.children[0].children[0].getScaleResolution("x")).toBe(
            view.children[0].children[1].getScaleResolution("x")
        );
        expect(view.children[1].children[0].getScaleResolution("x")).toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
    });

    test("Independent branches under a shared branch works as expected", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" }
            },

            resolve: {
                scale: { x: "shared" }
            },

            layer: [
                {
                    resolve: {
                        scale: { x: "independent" },
                        // TODO: Axis should be set independent implicitly
                        axis: { x: "independent" }
                    },
                    layer: [{ mark: "point" }, { mark: "point" }]
                },
                {
                    resolve: {
                        scale: { x: "independent" },
                        // TODO: Axis should be set independent implicitly
                        axis: { x: "independent" }
                    },
                    layer: [{ mark: "point" }, { mark: "point" }]
                }
            ]
        };

        const view = await createAndInitialize(spec, LayerView);

        expect(view.children[0].children[0].getScaleResolution("x")).not.toBe(
            view.children[1].children[0].getScaleResolution("x")
        );
        expect(view.children[0].children[1].getScaleResolution("x")).not.toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
        expect(view.children[0].children[0].getScaleResolution("x")).not.toBe(
            view.children[0].children[1].getScaleResolution("x")
        );
        expect(view.children[1].children[0].getScaleResolution("x")).not.toBe(
            view.children[1].children[1].getScaleResolution("x")
        );
    });

    test("Excluded resolution is not pushed towards the root but collects from children.", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" }
            },

            resolve: {
                scale: { x: "shared" }
            },

            layer: [
                { mark: "point" },
                { mark: "point" },
                {
                    resolve: {
                        scale: { x: "excluded" },
                        // TODO: Implicit
                        axis: { x: "excluded" }
                    },
                    layer: [{ mark: "point" }, { mark: "point" }]
                }
            ]
        };

        const view = await createAndInitialize(spec, LayerView);

        expect(view.children[0].getScaleResolution("x")).toBe(
            view.children[1].getScaleResolution("x")
        );

        expect(view.children[2].children[0].getScaleResolution("x")).toBe(
            view.children[2].children[1].getScaleResolution("x")
        );

        expect(view.children[0].getScaleResolution("x")).not.toBe(
            view.children[2].children[0].getScaleResolution("x")
        );
    });

    test("Default resolution is configurable", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" },
                y: { field: "data", type: "quantitative" }
            },

            resolve: {
                scale: {
                    // The hard default in LayerView is "shared".
                    default: "independent",
                    x: "shared"
                },
                axis: {
                    // TODO: Implicit
                    default: "independent"
                }
            },

            layer: [{ mark: "point" }, { mark: "point" }]
        };

        const view = await createAndInitialize(spec, LayerView);

        expect(view.children[0].getScaleResolution("x")).toBe(
            view.children[1].getScaleResolution("x")
        );

        expect(view.children[0].getScaleResolution("y")).not.toBe(
            view.children[1].getScaleResolution("y")
        );
    });
});

describe("Domain handling", () => {
    test("Scales are shared and domains merged properly", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },
            resolve: { scale: { x: "shared" } },
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

        /** @param {import("./view").default} view */
        const d = view =>
            view
                .getScaleResolution("y")
                .getScale()
                .domain();

        const view = await createAndInitialize(spec, LayerView);

        expect(r(d(view))).toEqual([1, 5]);
        expect(r(d(view.children[0]))).toEqual([1, 5]);
        expect(r(d(view.children[1]))).toEqual([1, 5]);
    });

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

import { describe, expect, test } from "vitest";
import { createAndInitialize } from "./testUtils";
import createDomain, { toRegularArray as r } from "../utils/domainArray";
import LayerView from "./layerView";
import ConcatView from "./concatView";
import UnitView from "./unitView";
import { primaryPositionalChannels } from "../encoder/encoder";

/**
 * @typedef {import("../spec/channel").Channel} Channel
 */

// NOTE: The most of these tests don't actually test scaleResolution but the resolution algorithm.

describe("Scale resolution", () => {
    test("Channels with just values (no fields or scales) do not resolve", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },

            resolve: {
                scale: { x: "shared" },
            },

            layer: [
                {
                    mark: "point",
                    encoding: {
                        color: { value: "red" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        color: { value: "green" },
                    },
                },
            ],
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
                x: { field: "data", type: "quantitative" },
            },

            resolve: { scale: { x: "shared" } },

            layer: [
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
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
                x: { field: "data", type: "quantitative" },
            },

            resolve: {
                scale: { x: "independent" },
                // TODO: Axis should be set independent implicitly
                axis: { x: "independent" },
            },

            layer: [
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
                {
                    resolve: { scale: { x: "shared" } },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
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
                x: { field: "data", type: "quantitative" },
            },

            resolve: {
                scale: { x: "shared" },
            },

            layer: [
                {
                    resolve: {
                        scale: { x: "independent" },
                        // TODO: Axis should be set independent implicitly
                        axis: { x: "independent" },
                    },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
                {
                    resolve: {
                        scale: { x: "independent" },
                        // TODO: Axis should be set independent implicitly
                        axis: { x: "independent" },
                    },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
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
                x: { field: "data", type: "quantitative" },
            },

            resolve: {
                scale: { x: "shared" },
            },

            layer: [
                { mark: "point" },
                { mark: "point" },
                {
                    resolve: {
                        scale: { x: "excluded" },
                        // TODO: Implicit
                        axis: { x: "excluded" },
                    },
                    layer: [{ mark: "point" }, { mark: "point" }],
                },
            ],
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

    // TODO: Add test for "forced" resolution

    test("Default resolution is configurable", async () => {
        /** @type {import("../spec/view").LayerSpec} */
        const spec = {
            data: { values: [] },
            encoding: {
                x: { field: "data", type: "quantitative" },
                y: { field: "data", type: "quantitative" },
            },

            resolve: {
                scale: {
                    // The hard default in LayerView is "shared".
                    default: "independent",
                    x: "shared",
                },
                axis: {
                    // TODO: Implicit
                    default: "independent",
                },
            },

            layer: [{ mark: "point" }, { mark: "point" }],
        };

        const view = await createAndInitialize(spec, LayerView);

        expect(view.children[0].getScaleResolution("x")).toBe(
            view.children[1].getScaleResolution("x")
        );

        expect(view.children[0].getScaleResolution("y")).not.toBe(
            view.children[1].getScaleResolution("y")
        );
    });

    describe("Vertical and horizontal concatenations defaults resolutions for positional channels", async () => {
        const makeTrack = (
            /** @type {"x" | "y"} */ channel,
            /** @type {"locus" | "index"} */ type
        ) => ({
            mark: "point",
            encoding: { [channel]: { field: "foo", type, axis: null } },
        });

        const create = async (
            /** @type {"vconcat" | "hconcat"} */ viewType,
            /** @type {import("../spec/channel").Type[]} */ types
        ) => {
            return await createAndInitialize(
                {
                    data: { values: [] },
                    [viewType]: types.map((t) =>
                        makeTrack(viewType === "vconcat" ? "x" : "y", t)
                    ),
                },
                ConcatView
            );
        };

        test('Single "locus" track defaults to "shared"', async () => {
            expect(
                (await create("vconcat", ["locus"])).getDefaultResolution(
                    "x",
                    "scale"
                )
            ).toBe("shared");
        });

        test('Two "locus" tracks defaults to "shared"', async () => {
            expect(
                (
                    await create("vconcat", ["locus", "locus"])
                ).getDefaultResolution("x", "scale")
            ).toBe("shared");
        });

        test('Single "index" track defaults to "shared"', async () => {
            expect(
                (await create("vconcat", ["index"])).getDefaultResolution(
                    "x",
                    "scale"
                )
            ).toBe("shared");
        });

        test('Mixed "locus" and "index" tracks default to "independent"', async () => {
            expect(
                (
                    await create("vconcat", ["locus", "index"])
                ).getDefaultResolution("x", "scale")
            ).toBe("independent");
        });

        test('Two "quantitative" tracks default to "independent"', async () => {
            expect(
                (
                    await create("vconcat", ["quantitative", "quantitative"])
                ).getDefaultResolution("x", "scale")
            ).toBe("independent");
        });

        test('Two vertical "quantitative" tracks default to "independent"', async () => {
            expect(
                (
                    await create("hconcat", ["quantitative", "quantitative"])
                ).getDefaultResolution("y", "scale")
            ).toBe("independent");
        });

        test('Two vertical "locus" tracks default to "shared"', async () => {
            expect(
                (
                    await create("hconcat", ["locus", "locus"])
                ).getDefaultResolution("y", "scale")
            ).toBe("shared");
        });
    });
});

describe("Domain handling", () => {
    test("Scales are shared and explicit domains merged properly", async () => {
        const view = await createAndInitialize(
            {
                data: { values: [] },
                resolve: { scale: { default: "independent", y: "shared" } },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "a",
                                type: "quantitative",
                                scale: { domain: [1, 2] },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "b",
                                type: "quantitative",
                                scale: { domain: [4, 5] },
                            },
                        },
                    },
                ],
            },
            LayerView
        );

        /** @param {import("./view").default} view */
        const d = (view) => view.getScaleResolution("y").getScale().domain();

        expect(r(d(view))).toEqual([1, 5]);
        expect(r(d(view.children[0]))).toEqual([1, 5]);
        expect(r(d(view.children[1]))).toEqual([1, 5]);
    });

    test("Scales are shared and extracted domains merged properly", async () => {
        const view = await createAndInitialize(
            {
                resolve: { scale: { default: "independent", y: "shared" } },
                layer: [
                    {
                        data: { values: [1, 2] },
                        mark: "point",
                        encoding: {
                            y: {
                                field: "data",
                                type: "quantitative",
                                scale: { zero: false },
                            },
                        },
                    },
                    {
                        data: { values: [4, 5] },
                        mark: "point",
                        encoding: {
                            y: { field: "data", type: "quantitative" },
                        },
                    },
                ],
            },
            LayerView
        );

        /** @param {import("./view").default} view */
        const d = (view) => view.getScaleResolution("y").getScale().domain();

        expect(r(d(view))).toEqual([1, 5]);
        expect(r(d(view.children[0]))).toEqual([1, 5]);
        expect(r(d(view.children[1]))).toEqual([1, 5]);
    });

    test("Scales of primary and secondary channels are shared and extracted domains merged properly", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { a: 1, b: 4 },
                        { a: 2, b: 5 },
                    ],
                },
                mark: "point",
                encoding: {
                    y: {
                        field: "a",
                        type: "quantitative",
                        scale: { zero: false },
                    },
                    y2: {
                        field: "b",
                    },
                },
            },
            UnitView
        );

        /** @param {import("./view").default} view */
        const d = (view) => view.getScaleResolution("y").getScale().domain();

        // FAILS!!!!!!! TODO: FIX!!
        // expect(r(d(view))).toEqual([1, 5]);
    });

    test("resolutionChannel property is respected", async () => {
        const view = await createAndInitialize(
            {
                data: { values: [] },
                resolve: { scale: { default: "independent", y: "shared" } },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "a",
                                type: "quantitative",
                                scale: { domain: [1, 2] },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                field: "b",
                                type: "quantitative",
                                scale: { domain: [4, 5] },
                                resolutionChannel: "y",
                            },
                        },
                    },
                ],
            },
            LayerView
        );

        /** @param {import("./view").default} view */
        const d = (view) => view.getScaleResolution("y").getScale().domain();

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
                    y: { field: "data", type: "quantitative" },
                },
            },
            UnitView
        );

        for (const channel of primaryPositionalChannels) {
            // Extract domain from data
            view.getScaleResolution(channel).reconfigure();
        }

        const d = /** @param {import("../spec/channel").Channel} channel*/ (
            channel
        ) => view.getScaleResolution(channel).getScale().domain();

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
                        scale: { domain: [1, 4] },
                    },
                    y: {
                        field: "data",
                        type: "quantitative",
                        scale: { domain: [1, 4] },
                    },
                },
            },
            UnitView
        );

        const d = /** @param {Channel} channel*/ (channel) =>
            view.getScaleResolution(channel).getScale().domain();

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
                        scale: { zero: false },
                    },
                    y: {
                        field: "data",
                        type: "quantitative",
                        scale: { zero: false },
                    },
                },
            },
            UnitView
        );

        for (const channel of primaryPositionalChannels) {
            // Extract domain from data
            view.getScaleResolution(channel).reconfigure();
        }

        const d = /** @param {Channel} channel*/ (channel) =>
            view.getScaleResolution(channel).getScale().domain();

        expect(d("x")).toEqual([2, 3]);
        expect(d("y")).toEqual([2, 3]);
    });
});

describe("Named scales", () => {
    test("Resolution of shared scales with conflicting names fails with an exception", async () => {
        return expect(
            createAndInitialize(
                {
                    data: { values: [1, 2] },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_2" },
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(/conflicting/);
    });

    test("A name is properly registered to the ScaleResolution object", async () => {
        expect(
            await createAndInitialize(
                {
                    data: { values: [1, 2] },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                    ],
                },
                LayerView
            ).then((view) => view.getScaleResolution("x"))
        ).toHaveProperty("name", "scale_1");
    });

    test("The scale name must be unique among the scale resolutions", async () => {
        return expect(
            createAndInitialize(
                {
                    resolve: { scale: { x: "independent" } },
                    data: { values: [1, 2] },
                    layer: [
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                        {
                            mark: "point",
                            encoding: {
                                x: {
                                    field: "data",
                                    type: "quantitative",
                                    scale: { name: "scale_1" },
                                },
                            },
                        },
                    ],
                },
                LayerView
            )
        ).rejects.toThrow(/multiple/);
    });
});

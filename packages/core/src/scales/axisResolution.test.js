import { describe, expect, test } from "vitest";
import AxisResolution from "./axisResolution.js";
import { createAndInitialize } from "../view/testUtils.js";
import UnitView from "../view/unitView.js";
import View from "../view/view.js";
import { markViewAsChrome } from "../view/viewSelectors.js";

/** @type {import("../spec/view.js").LayerSpec} */
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
                    scale: { domain: [1, 2] },
                },
                color: { value: "red" },
            },
        },
        {
            mark: "point",
            encoding: {
                x: { field: "a", type: "quantitative" },
                y: {
                    field: "b",
                    type: "quantitative",
                    scale: { domain: [4, 5] },
                },
                color: { value: "green" },
            },
        },
    ],
};

const layer0 = /** @type {import("../spec/view.js").UnitSpec} */ (
    spec.layer[0]
);
const layer1 = /** @type {import("../spec/view.js").UnitSpec} */ (
    spec.layer[1]
);

describe("Axes resolve properly", () => {
    test("Chrome members do not suppress non-chrome axes", () => {
        const scaleResolution = {};
        const chromeAncestor = {};
        markViewAsChrome(/** @type {any} */ (chromeAncestor), {
            skipSubtree: true,
        });

        const resolution = new AxisResolution("x");
        resolution.registerMember(
            makeAxisResolutionMember({
                scaleResolution,
                channelDef: { field: "x", type: "quantitative" },
            })
        );
        resolution.registerMember(
            makeAxisResolutionMember({
                scaleResolution,
                channelDef: {
                    datum: { expr: "brush.intervals.x[0]" },
                    type: "quantitative",
                    axis: null,
                },
                layoutAncestors: [chromeAncestor],
            })
        );

        expect(resolution.getAxisProps()).not.toBeNull();
        expect(resolution.getTitle()).toBe("x");
    });

    test("Chrome-only members do not create axes", () => {
        const scaleResolution = {};
        const chromeAncestor = {};
        markViewAsChrome(/** @type {any} */ (chromeAncestor), {
            skipSubtree: true,
        });

        const resolution = new AxisResolution("x");
        resolution.registerMember(
            makeAxisResolutionMember({
                scaleResolution,
                channelDef: {
                    field: "x",
                    type: "quantitative",
                    axis: null,
                },
                layoutAncestors: [chromeAncestor],
            })
        );

        expect(resolution.getAxisProps()).toBeNull();
    });

    test("Independent axes are independent", async () => {
        const view = await createAndInitialize(
            {
                ...spec,
                resolve: { scale: { y: "shared" }, axis: { y: "independent" } },
            },
            View
        );

        const [r0, r1] = [0, 1].map((i) =>
            // @ts-ignore
            view.children[i].getAxisResolution("y")
        );

        expect(r0).toBeDefined();
        expect(r1).toBeDefined();
        expect(r0).not.toBe(r1);
    });

    test("Shared axes have joined titles", async () => {
        const view = await createAndInitialize(
            {
                ...spec,
                resolve: { scale: { y: "shared" }, axis: { y: "shared" } },
            },
            View
        );
        // @ts-ignore
        expect(view.children[0].getAxisResolution("y").getTitle()).toEqual(
            "a, b"
        );
    });

    test("Explicit axis title overrides concatenation", async () => {
        const view = await createAndInitialize(
            {
                ...spec,
                layer: [
                    {
                        ...layer0,
                        encoding: {
                            ...layer0.encoding,
                            y: {
                                field: "a",
                                type: "quantitative",
                                axis: { title: "Value" },
                            },
                        },
                    },
                    layer1,
                ],
                resolve: { scale: { y: "shared" }, axis: { y: "shared" } },
            },
            View
        );
        // @ts-ignore
        expect(view.children[0].getAxisResolution("y").getTitle()).toEqual(
            "Value"
        );
    });

    test("Shared axes concatenate titles when no axis title is present", async () => {
        const view = await createAndInitialize(
            {
                ...spec,
                layer: [
                    {
                        ...layer0,
                        encoding: {
                            ...layer0.encoding,
                            y: {
                                field: "a",
                                type: "quantitative",
                                title: "Alpha",
                            },
                        },
                    },
                    {
                        ...layer1,
                        encoding: {
                            ...layer1.encoding,
                            y: {
                                field: "b",
                                type: "quantitative",
                                title: "Beta",
                            },
                        },
                    },
                ],
                resolve: { scale: { y: "shared" }, axis: { y: "shared" } },
            },
            View
        );
        // @ts-ignore
        expect(view.children[0].getAxisResolution("y").getTitle()).toEqual(
            "Alpha, Beta"
        );
    });

    test("Title is taken from axis title, encoding title, and field name, in that order.", async () => {
        let view = await createAndInitialize(
            {
                data: { values: [] },
                mark: "point",
                encoding: {
                    x: { field: "a", type: "quantitative" },
                    y: {
                        field: "a",
                        type: "quantitative",
                    },
                },
            },
            UnitView
        );
        expect(view.getAxisResolution("y").getTitle()).toEqual("a");

        view = await createAndInitialize(
            {
                data: { values: [] },
                mark: "point",
                encoding: {
                    x: { field: "a", type: "quantitative" },
                    y: {
                        field: "a",
                        title: "x",
                        type: "quantitative",
                    },
                },
            },
            UnitView
        );
        expect(view.getAxisResolution("y").getTitle()).toEqual("x");

        view = await createAndInitialize(
            {
                data: { values: [] },
                mark: "point",
                encoding: {
                    x: { field: "a", type: "quantitative" },
                    y: {
                        field: "a",
                        title: "x",
                        type: "quantitative",
                        axis: {
                            title: "z",
                        },
                    },
                },
            },
            UnitView
        );
        expect(view.getAxisResolution("y").getTitle()).toEqual("z");
    });

    test("Conditional positional field branches contribute axis titles", async () => {
        /** @type {any} */
        const spec = {
            params: [{ name: "p" }],
            data: { values: [{ a: 1 }, { a: 2 }] },
            mark: "point",
            encoding: {
                x: {
                    value: 0,
                    condition: {
                        param: "p",
                        field: "a",
                        type: "quantitative",
                    },
                },
                y: { value: 1 },
            },
        };

        const view = await createAndInitialize(spec, UnitView);

        expect(view.getAxisResolution("x").getTitle()).toEqual("a");
    });

    test("Plain positional values do not create axis resolutions", async () => {
        const view = await createAndInitialize(
            {
                config: { axis: { grid: true } },
                data: { values: [{ label: "A" }] },
                mark: "text",
                encoding: {
                    x: { value: 0 },
                    y: { value: 0.5 },
                    text: { field: "label" },
                },
            },
            UnitView
        );

        expect(view.getScaleResolution("x")).toBeUndefined();
        expect(view.getScaleResolution("y")).toBeUndefined();
        expect(view.getAxisResolution("x")).toBeUndefined();
        expect(view.getAxisResolution("y")).toBeUndefined();
    });

    test("Conditional positional field arrays contribute axis titles", async () => {
        /** @type {any} */
        const spec = {
            params: [{ name: "p" }, { name: "q" }],
            data: { values: [{ a: 1 }, { b: 2 }] },
            mark: "point",
            encoding: {
                x: {
                    value: 0,
                    condition: [
                        { param: "p", value: 1 },
                        {
                            param: "q",
                            field: "a",
                            type: "quantitative",
                        },
                    ],
                },
                y: { value: 1 },
            },
        };

        const view = await createAndInitialize(spec, UnitView);

        expect(view.getAxisResolution("x").getTitle()).toEqual("a");
    });

    test("Primary and secondary channels are included in the title", async () => {
        let view = await createAndInitialize(
            {
                data: { values: [] },
                mark: "rule",
                encoding: {
                    x: { field: "a", type: "quantitative" },
                    x2: { field: "b" },
                },
            },
            UnitView
        );
        expect(view.getAxisResolution("x").getTitle()).toEqual("a, b");
    });

    test("Secondary channel's field name is hidden if primary channel has an explicit title", async () => {
        let view = await createAndInitialize(
            {
                data: { values: [] },
                mark: "rule",
                encoding: {
                    x: { field: "a", type: "quantitative", title: "foo" },
                    x2: { field: "b" },
                },
            },
            UnitView
        );
        expect(view.getAxisResolution("x").getTitle()).toEqual("foo");

        let view2 = await createAndInitialize(
            {
                data: { values: [] },
                mark: "rule",
                encoding: {
                    x: {
                        field: "a",
                        type: "quantitative",
                        axis: { title: "foo" },
                    },
                    x2: { field: "b" },
                },
            },
            UnitView
        );
        expect(view2.getAxisResolution("x").getTitle()).toEqual("foo");

        let view3 = await createAndInitialize(
            {
                data: { values: [] },
                mark: "rule",
                encoding: {
                    x: {
                        field: "a",
                        type: "quantitative",
                        axis: { title: "foo" },
                    },
                    x2: { field: "b", title: "bar" },
                },
            },
            UnitView
        );
        expect(view3.getAxisResolution("x").getTitle()).toEqual("foo");

        let view4 = await createAndInitialize(
            {
                data: { values: [] },
                mark: "rule",
                encoding: {
                    x: {
                        field: "a",
                        type: "quantitative",
                        title: null,
                    },
                    x2: { field: "b" },
                },
            },
            UnitView
        );
        expect(view4.getAxisResolution("x").getTitle()).toBeNull();
    });
});

/**
 * @param {{
 *     scaleResolution: object,
 *     channelDef: any,
 *     layoutAncestors?: object[],
 * }} options
 * @returns {import("./axisResolution.js").AxisResolutionMember}
 */
function makeAxisResolutionMember({
    scaleResolution,
    channelDef,
    layoutAncestors = [],
}) {
    return {
        view: /** @type {any} */ ({
            mark: { encoding: { x: channelDef } },
            getScaleResolution: () => scaleResolution,
            getLayoutAncestors: () => layoutAncestors,
            isVisible: () => true,
            getPathString: () => "test",
        }),
        channel: "x",
        channelDef,
    };
}

import { describe, expect, test } from "vitest";
import { createAndInitialize } from "./testUtils.js";
import UnitView from "./unitView.js";
import View from "./view.js";

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

describe("Axes resolve properly", () => {
    const sharedSpec = {
        ...spec,
        resolve: { scale: { y: "shared" }, axis: { y: "shared" } },
    };

    test("Independent axes are independent", async () => {
        const independentSpec = {
            ...spec,
            resolve: { scale: { y: "shared" }, axis: { y: "independent" } },
        };

        const view = await createAndInitialize(independentSpec, View);
        const [r0, r1] = [0, 1].map((i) =>
            view.children[i].getAxisResolution("y")
        );

        expect(r0).toBeDefined();
        expect(r1).toBeDefined();
        expect(r0).not.toBe(r1);
    });

    test("Shared axes have joined titles", async () => {
        const view = await createAndInitialize(sharedSpec, View);
        expect(view.children[0].getAxisResolution("y").getTitle()).toEqual(
            "a, b"
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
        expect(view3.getAxisResolution("x").getTitle()).toEqual("foo, bar");

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

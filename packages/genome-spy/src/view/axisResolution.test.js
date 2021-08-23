import { createAndInitialize } from "./testUtils";
import UnitView from "./unitView";
import View from "./view";

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
                data: { values: [1] },
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
                data: { values: [1] },
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
                data: { values: [1] },
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

    test.todo("Test legend titles when legends are implemented");
});

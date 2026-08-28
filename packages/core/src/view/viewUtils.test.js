import { describe, expect, test } from "vitest";

import { createAndInitialize, createTestViewContext } from "./testUtils.js";
import UnitView from "./unitView.js";
import { findEncodedFields } from "./viewUtils.js";
import { initializeViewSubtree } from "../data/flowInit.js";

describe("initializeViewSubtree", () => {
    test("initializes data flow for a subtree only", async () => {
        const context = createTestViewContext();

        /** @type {import("../spec/view.js").HConcatSpec} */
        const spec = {
            hconcat: [
                {
                    data: {
                        values: [{ x: 1 }],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    data: {
                        values: [{ x: 2 }],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        const concatRoot = /** @type {import("./concatView.js").default} */ (
            root
        );
        const child = concatRoot.children[0];
        const otherChild = concatRoot.children[1];

        const { dataSources, unitViews } = initializeViewSubtree(
            child,
            context.dataFlow
        );

        expect(dataSources.size).toBe(1);
        expect(unitViews.length).toBe(1);

        expect(child.flowHandle?.dataSource).toBeDefined();
        expect(otherChild.flowHandle?.dataSource).toBeUndefined();
    });
});

describe("findEncodedFields", () => {
    test("treats semanticScore fields as quantitative", async () => {
        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: {
                values: [{ x: 1, score: 2 }],
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                semanticScore: { field: "score" },
            },
        };

        const view = await createAndInitialize(spec, UnitView);

        expect(findEncodedFields(view)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    channel: "semanticScore",
                    field: "score",
                    type: "quantitative",
                }),
            ])
        );
    });

    test("includes conditional field branches", async () => {
        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            params: [{ name: "p" }],
            data: {
                values: [{ a: 1, group: "x" }],
            },
            mark: "point",
            encoding: {
                x: { field: "a", type: "quantitative" },
                color: {
                    value: "lightgray",
                    condition: {
                        param: "p",
                        field: "group",
                        type: "nominal",
                    },
                },
            },
        };

        const view = await createAndInitialize(spec, UnitView);

        expect(findEncodedFields(view).map((info) => info.field)).toEqual([
            "a",
            "group",
        ]);
    });
});

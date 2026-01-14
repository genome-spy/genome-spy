import { describe, expect, test, vi } from "vitest";

import { createTestViewContext } from "./testUtils.js";
import { finalizeSubtreeGraphics } from "./viewUtils.js";
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

        const { dataSources, graphicsPromises, unitViews } =
            initializeViewSubtree(child, context.dataFlow);

        expect(dataSources.size).toBe(1);
        expect(unitViews.length).toBe(1);
        expect(graphicsPromises.length).toBe(0);

        expect(child.flowHandle?.dataSource).toBeDefined();
        expect(otherChild.flowHandle?.dataSource).toBeUndefined();
    });
});

describe("finalizeSubtreeGraphics", () => {
    test("finalizes marks when allowed", async () => {
        const markA = /** @type {import("../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                finalizeGraphicsInitialization: vi.fn(),
            })
        );
        const markB = /** @type {import("../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                finalizeGraphicsInitialization: vi.fn(),
            })
        );

        await finalizeSubtreeGraphics([
            Promise.resolve(markA),
            Promise.resolve(markB),
        ]);

        expect(markA.finalizeGraphicsInitialization).toHaveBeenCalledTimes(1);
        expect(markB.finalizeGraphicsInitialization).toHaveBeenCalledTimes(1);
    });

    test("skips finalization when predicate is false", async () => {
        const mark = /** @type {import("../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                finalizeGraphicsInitialization: vi.fn(),
            })
        );

        await finalizeSubtreeGraphics([Promise.resolve(mark)], () => false);

        expect(mark.finalizeGraphicsInitialization).not.toHaveBeenCalled();
    });
});

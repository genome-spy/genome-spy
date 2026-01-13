import { describe, expect, test, vi } from "vitest";

import { createTestViewContext } from "./testUtils.js";
import { finalizeSubtreeGraphics, initializeSubtree } from "./viewUtils.js";

describe("initializeSubtree", () => {
    test("initializes data flow for a subtree only", async () => {
        const context = createTestViewContext();

        /** @type {import("../spec/view.js").ConcatSpec} */
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
        const child = root.children[0];
        const otherChild = root.children[1];

        const { dataSources, graphicsPromises, unitViews } = initializeSubtree(
            child,
            context.dataFlow
        );

        expect(dataSources.size).toBe(1);
        expect(unitViews.length).toBe(1);
        expect(graphicsPromises.length).toBe(0);

        expect(context.dataFlow.findDataSourceByKey(child)).toBeDefined();
        expect(
            context.dataFlow.findDataSourceByKey(otherChild)
        ).toBeUndefined();
    });
});

describe("finalizeSubtreeGraphics", () => {
    test("finalizes marks when allowed", async () => {
        const markA = { finalizeGraphicsInitialization: vi.fn() };
        const markB = { finalizeGraphicsInitialization: vi.fn() };

        await finalizeSubtreeGraphics([
            Promise.resolve(markA),
            Promise.resolve(markB),
        ]);

        expect(markA.finalizeGraphicsInitialization).toHaveBeenCalledTimes(1);
        expect(markB.finalizeGraphicsInitialization).toHaveBeenCalledTimes(1);
    });

    test("skips finalization when predicate is false", async () => {
        const mark = { finalizeGraphicsInitialization: vi.fn() };

        await finalizeSubtreeGraphics([Promise.resolve(mark)], () => false);

        expect(mark.finalizeGraphicsInitialization).not.toHaveBeenCalled();
    });
});

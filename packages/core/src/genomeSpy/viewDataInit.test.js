import { describe, expect, test } from "vitest";

import { createTestViewContext } from "../view/testUtils.js";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "./viewDataInit.js";

describe("viewDataInit", () => {
    test("skips hidden subtrees during initial data initialization", async () => {
        const context = createTestViewContext();
        context.isViewConfiguredVisible = (view) => view.spec.visible ?? true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").VConcatSpec} */
        const spec = {
            vconcat: [
                {
                    name: "visible",
                    data: { values: [{ x: 1 }, { x: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    name: "hidden",
                    visible: false,
                    data: { values: [{ x: 3 }, { x: 4 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");

        await initializeViewData(
            root,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const visibleView = root
            .getDescendants()
            .find((view) => view.name === "visible");
        const hiddenView = root
            .getDescendants()
            .find((view) => view.name === "hidden");

        expect(visibleView?.flowHandle?.collector).toBeDefined();
        expect(visibleView?.getDataInitializationState()).toBe("ready");

        // Hidden views should not allocate collectors or mark initialization.
        expect(hiddenView?.flowHandle).toBeUndefined();
        expect(hiddenView?.getDataInitializationState()).toBe("none");
    });

    test("initializes newly visible views without rebuilding existing collectors", async () => {
        const context = createTestViewContext();
        context.isViewConfiguredVisible = (view) => view.spec.visible ?? true;
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").VConcatSpec} */
        const spec = {
            vconcat: [
                {
                    name: "visible",
                    data: { values: [{ x: 1 }, { x: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    name: "hidden",
                    visible: false,
                    data: { values: [{ x: 3 }, { x: 4 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");
        await initializeViewData(
            root,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const visibleView = root
            .getDescendants()
            .find((view) => view.name === "visible");
        const hiddenView = root
            .getDescendants()
            .find((view) => view.name === "hidden");
        const visibleCollector = visibleView?.flowHandle?.collector;

        // Toggle visibility predicate to include the previously hidden view.
        context.isViewConfiguredVisible = () => true;

        await initializeVisibleViewData(
            root,
            context.dataFlow,
            context.fontManager
        );

        expect(hiddenView?.flowHandle?.collector).toBeDefined();
        expect(hiddenView?.getDataInitializationState()).toBe("ready");
        expect(visibleView?.flowHandle?.collector).toBe(visibleCollector);
    });
});

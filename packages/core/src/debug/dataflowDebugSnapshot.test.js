import { describe, expect, test } from "vitest";
import View from "../view/view.js";
import { createAndInitialize } from "../view/testUtils.js";
import { createDataflowDebugSnapshot } from "./dataflowDebugSnapshot.js";

describe("createDataflowDebugSnapshot", () => {
    test("summarizes dataflow nodes and propagation stats", async () => {
        const view = await createAndInitialize(
            {
                data: { values: [{ x: 1 }, { x: 2 }] },
                transform: [{ type: "filter", expr: "datum.x > 1" }],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            },
            View
        );

        const ids = new WeakMap();
        let nextId = 0;
        const snapshot = createDataflowDebugSnapshot(view.context.dataFlow, {
            getDebugId: (object) => {
                if (!ids.has(object)) {
                    nextId += 1;
                    ids.set(object, "d" + String(nextId));
                }
                return ids.get(object);
            },
            rootView: view,
        });

        expect(snapshot.sourceIds.length).toBeGreaterThan(0);
        expect(snapshot.collectorCount).toBeGreaterThan(0);
        expect(snapshot.nodes.map((node) => node.label)).toContain("filter");
        expect(snapshot.nodes.some((node) => node.count > 0)).toBe(true);
        expect(
            snapshot.nodes.find((node) => node.label === "filter")
        ).toMatchObject({
            viewPath: "viewRoot",
        });
        expect(
            snapshot.nodes.find((node) => node.label === "collect")
        ).toMatchObject({
            viewPath: "viewRoot",
        });
        expect(view.flowHandle.collector.paramRuntimeProvider).toBeUndefined();
    });
});

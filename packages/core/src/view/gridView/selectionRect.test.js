import { expect, onTestFinished, test } from "vitest";

import ConcatView from "../concatView.js";
import { createAndInitialize } from "../testUtils.js";
import { createSelectionRectOverlay } from "./selectionRect.js";

test("creates a domain-inert overlay with the configured brush zindex", async () => {
    const parent = await createAndInitialize(
        {
            params: [
                {
                    name: "selection",
                    value: {
                        type: "interval",
                        intervals: { x: [0, 1], y: [2, 3] },
                    },
                },
            ],
            hconcat: [
                {
                    data: { values: [{ x: 0, y: 0 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                    },
                },
            ],
        },
        ConcatView
    );
    onTestFinished(() => parent.disposeSubtree());
    const child = parent.children[0];
    const overlay = createSelectionRectOverlay({
        selectionExpr: parent.paramRuntime.createExpression("selection"),
        selectionExpression: "selection",
        channels: ["x", "y"],
        brushConfig: { zindex: 7, cursor: { expr: "'copy'" } },
        context: parent.context,
        layoutParent: parent,
        dataParent: child,
        scaleResolutionSource: child,
    });
    onTestFinished(() => overlay.view.disposeSubtree());

    expect(overlay.view.isDomainInert()).toBe(true);
    expect(overlay.zindex).toBe(7);
    expect(overlay.view.spec.layer[0]).toMatchObject({
        mark: { cursor: { expr: "'copy'" } },
    });
});

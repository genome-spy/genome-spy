import { expect, test, vi } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

test("shared collector publication extracts a contributor once and notifies a coherent domain", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ x: 0 }, { x: 10 }] },
        layer: [
            {
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            },
            {
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            },
        ],
    });
    try {
        const [left, right] =
            /** @type {import("../view/layerView.js").default} */ (view)
                .children;
        const leftUnit = /** @type {import("../view/unitView.js").default} */ (
            left
        );
        const rightUnit = /** @type {import("../view/unitView.js").default} */ (
            right
        );
        const collector = leftUnit.getCollector();
        // Model the merged collector topology also used by optimized dataflows.
        // The optimizer may keep separate collectors when mark IDs differ.
        rightUnit.flowHandle.collector = collector;
        const x = getRequiredScaleResolution(view, "x");
        x.reconfigure();
        const query = vi.spyOn(collector, "getDomain");
        const notified = vi.fn(() => {
            expect(x.getDomain()).toEqual([0, 20]);
            expect(x.scale.domain()).toEqual([0, 20]);
        });
        x.addEventListener("domain", notified);
        const source =
            /** @type {import("../data/sources/inlineSource.js").default} */ (
                view.flowHandle.dataSource
            );
        source.updateDynamicData([{ x: 0 }, { x: 20 }]);
        expect(query).toHaveBeenCalledTimes(1);
        expect(notified).toHaveBeenCalledTimes(1);
        query.mockRestore();
    } finally {
        view.disposeSubtree();
    }
});

test("a detached contributor cannot republish into a live shared scale", async () => {
    const { view } = await createHeadlessEngine({
        layer: [
            {
                data: { values: [{ x: 0 }, { x: 10 }] },
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            },
            {
                data: { values: [{ x: 0 }, { x: 20 }] },
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            },
        ],
    });
    try {
        const layer = /** @type {import("../view/layerView.js").default} */ (
            view
        );
        const detached = /** @type {import("../view/unitView.js").default} */ (
            layer.children[1]
        );
        const collector = detached.getCollector();
        const x = getRequiredScaleResolution(view, "x");
        expect(x.getDomain()).toEqual([0, 20]);
        await layer.removeChildAt(1);
        expect(x.getDomain()).toEqual([0, 10]);
        const notified = vi.fn();
        x.addEventListener("domain", notified);
        const active = /** @type {import("../view/unitView.js").default} */ (
            layer.children[0]
        );
        const query = vi.spyOn(active.getCollector(), "getDomain");

        // A late publication from an already detached branch must not refresh
        // the remaining contributors, even when its rows would extend the domain.
        collector.reset();
        collector.handle({ x: 100 });
        collector.complete();
        expect(x.getDomain()).toEqual([0, 10]);
        expect(query).not.toHaveBeenCalled();
        expect(notified).not.toHaveBeenCalled();
        query.mockRestore();

        const source =
            /** @type {import("../data/sources/inlineSource.js").default} */ (
                active.flowHandle.dataSource
            );
        source.updateDynamicData([{ x: 0 }, { x: 30 }]);
        expect(x.getDomain()).toEqual([0, 30]);
        expect(notified).toHaveBeenCalledTimes(1);
    } finally {
        view.disposeSubtree();
    }
});

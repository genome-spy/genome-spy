import { expect, test, vi } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

test("empty index data keeps finite domains and later publishes a half-open loaded extent", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [] },
        mark: "point",
        encoding: {
            x: {
                field: "position",
                type: "index",
                scale: { zoom: { extent: "data" } },
            },
        },
    });
    try {
        const x = getRequiredScaleResolution(view, "x");
        const source =
            /** @type {import("../data/sources/inlineSource.js").default} */ (
                view.flowHandle.dataSource
            );
        expect(Array.from(x.getDataDomain())).toEqual([]);
        expect(x.getDomain()).toHaveLength(2);
        expect(x.getDomain().every(Number.isFinite)).toBe(true);
        expect(x.zoomExtent).toHaveLength(2);
        expect(x.zoomExtent.every(Number.isFinite)).toBe(true);

        source.updateDynamicData([{ position: 2 }, { position: 5 }]);
        expect(Array.from(x.getDataDomain())).toEqual([2, 5]);
        expect(x.zoomExtent).toEqual([2, 6]);
        expect(x.getDomain().every(Number.isFinite)).toBe(true);

        // Completed initial zoom history may preserve the empty display. The new
        // loaded extent must nevertheless support public inclusive navigation.
        await x.zoomTo([2, 5]);
        expect(x.getDomain()).toEqual([2, 6]);
        expect(x.scale.domain()).toEqual([2, 6]);
        expect(x.getComplexDomain()).toEqual([2, 5]);
    } finally {
        view.disposeSubtree();
    }
});

test("an authored index domain does not extract an unused data extent", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ position: 2 }] },
        mark: "point",
        encoding: {
            x: { field: "position", type: "index", scale: { domain: [0, 10] } },
        },
    });
    try {
        const unit = /** @type {import("../view/unitView.js").default} */ (
            view
        );
        const query = vi.spyOn(unit.getCollector(), "getDomain");
        const source =
            /** @type {import("../data/sources/inlineSource.js").default} */ (
                view.flowHandle.dataSource
            );
        source.updateDynamicData([{ position: 4 }, { position: 6 }]);
        expect(getRequiredScaleResolution(view, "x").getDomain()).toEqual([
            0, 11,
        ]);
        expect(query).not.toHaveBeenCalled();
        query.mockRestore();
    } finally {
        view.disposeSubtree();
    }
});

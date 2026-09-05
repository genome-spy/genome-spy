import { expect, test } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

test.each([false, true])(
    "startup seeds a linked initial interval (domain-inert data: %s)",
    async (domainInert) => {
        const { view } = await createHeadlessEngine({
            params: [
                {
                    name: "brush",
                    value: { type: "interval", intervals: { x: null } },
                },
            ],
            data: { values: [{ x: 0 }, { x: 10 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    domainInert,
                    scale: {
                        domain: { param: "brush", initial: [3, 7] },
                        zoom: true,
                    },
                },
            },
        });
        try {
            const x = getRequiredScaleResolution(view, "x");
            expect(x.getDomain()).toEqual([3, 7]);
            expect(view.paramRuntime.getValue("brush").intervals.x).toEqual([
                3, 7,
            ]);
            // Inert data cannot produce a collector domain notification, but the
            // authored initial interval must still support valid navigation.
            expect(x.zoomExtent).toHaveLength(2);
            expect(x.zoomExtent.every(Number.isFinite)).toBe(true);
        } finally {
            view.disposeSubtree();
        }
    }
);

test("startup clears an initial brush that matches the loaded fallback", async () => {
    const { view } = await createHeadlessEngine({
        params: [
            {
                name: "brush",
                value: { type: "interval", intervals: { x: null } },
            },
        ],
        data: { values: [{ x: 0 }, { x: 10 }] },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: {
                    domain: { param: "brush", initial: [0, 10] },
                    zoom: true,
                },
            },
        },
    });
    try {
        expect(getRequiredScaleResolution(view, "x").getDomain()).toEqual([
            0, 10,
        ]);
        expect(view.paramRuntime.getValue("brush").intervals.x).toBeNull();
    } finally {
        view.disposeSubtree();
    }
});

import { expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

test("reactive gap configuration and navigation use the scale resolution publication path", async () => {
    const { view } = await createHeadlessEngine({
        params: [
            { name: "cuts", value: [10] },
            { name: "width", value: 6 },
        ],
        data: { values: [{ x: 0 }, { x: 29 }] },
        mark: "point",
        scales: {
            x: {
                type: "index",
                domain: [9, 28],
                zoom: { extent: "unbounded" },
                gapPositions: { expr: "cuts" },
                gapWidth: { expr: "width" },
            },
        },
        encoding: { x: { field: "x", type: "index", axis: null } },
    });
    try {
        const resolution = view.getScaleResolution("x");
        const scale =
            /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                resolution.getScale()
            );
        scale.axisLength(100);
        const previous = scale.position(10);
        resolution.zoom(1, 0.5, -0.06);
        expect(scale.domain()[0]).toBe(10);
        expect(scale.position(10)).toBeCloseTo(previous - 0.06);
        expect(scale.invert(0.02)).toBe(10);
        view.paramRuntime.setValue("width", 12);
        view.paramRuntime.flushNow();
        expect(scale.position(10) - scale.position(10, 0, true)).toBeCloseTo(
            0.12
        );
        view.paramRuntime.setValue("cuts", []);
        view.paramRuntime.flushNow();
        expect(scale.gapPositions()).toEqual([]);
        expect(scale.gapMapping().gap).toBe(0.12);
    } finally {
        view.disposeSubtree();
    }
});

test.each([
    { gapPositions: [], gapWidth: { expr: "missing" } },
    { gapPositions: { expr: "missing" }, gapWidth: 0 },
])(
    "static disabling does not bind the other property's expression: %j",
    async (gaps) => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 0 }] },
            mark: "point",
            encoding: { x: { field: "x", type: "index", scale: gaps } },
        });
        expect(
            /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                view.getScaleResolution("x").getScale()
            ).gapMapping()
        ).toBeUndefined();
        view.disposeSubtree();
    }
);

test("pointer zoom uses its actual placement size", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ x: 0 }, { x: 19 }] },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "index",
                axis: null,
                scale: {
                    domain: [0, 19],
                    zoom: { extent: "unbounded" },
                    gapPositions: [10],
                    gapWidth: 6,
                },
            },
        },
    });
    try {
        const resolution = view.getScaleResolution("x");
        const scale =
            /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                resolution.getScale()
            );
        scale.axisLength(100);
        const coordinate = scale.gapMapping(200).invertPoint(0.25).value;
        resolution.zoom(0.5, 0.25, 0, 200);
        expect(scale.gapMapping(200).invertPoint(0.25).value).toBeCloseTo(
            coordinate
        );
    } finally {
        view.disposeSubtree();
    }
});

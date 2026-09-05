import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import ScaleResolution from "./scaleResolution.js";

/** @returns {Promise<import("../view/layerView.js").default>} */
async function createLayer() {
    const { view } = await createHeadlessEngine({
        params: [{ name: "multiplier", value: 1 }],
        layer: [
            {
                name: "base",
                data: { values: [{ category: "A", value: 2 }] },
                transform: [
                    {
                        type: "formula",
                        expr: "datum.value * multiplier",
                        as: "value",
                    },
                ],
                mark: "point",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                },
            },
        ],
    });
    return /** @type {import("../view/layerView.js").default} */ (view);
}

/** @type {import("../spec/view.js").UnitSpec} */
const addedLayer = {
    data: { values: [{ category: "B", value: 4 }] },
    mark: "point",
    encoding: {
        x: { field: "category", type: "nominal" },
        y: { field: "value", type: "quantitative" },
    },
};

describe("scale registration batches", () => {
    test("rejects overlapping batches before invoking the inner callback", async () => {
        const view = await createLayer();
        const x = view.getScaleResolution("x");
        const inner = vi.fn();
        try {
            expect(() =>
                ScaleResolution.registerInBatch([x], () =>
                    ScaleResolution.registerInBatch([x], inner)
                )
            ).toThrow("Overlapping scale registration batches");
            expect(inner).not.toHaveBeenCalled();
            // The failed outer batch must release registration suppression.
            await view.addChildSpec(structuredClone(addedLayer));
            expect(x.getDomain()).toEqual(["A", "B"]);
            await view.removeChildAt(1);
            expect(x.getDomain()).toEqual(["A"]);
        } finally {
            view.disposeSubtree();
        }
    });

    test("restores live scales when viewport topology validation fails during binding", async () => {
        const view = await createLayer();
        const x = view.getScaleResolution("x");
        const y = view.getScaleResolution("y");
        const members = y.getOrderedMembers();
        try {
            // Configured-domain preflight accepts this declaration. Binding the
            // existing Y member discovers that categorical X cannot define a viewport.
            const invalid = structuredClone(addedLayer);
            invalid.encoding.y = {
                field: "value",
                type: "quantitative",
                scale: { domain: { source: "viewport" } },
            };
            await expect(view.addChildSpec(invalid)).rejects.toThrow(
                "requires an independent continuous positional scale"
            );
            expect(view.children.map((child) => child.name)).toEqual(["base"]);
            expect(y.getOrderedMembers()).toEqual(members);
            expect(x.getDomain()).toEqual(["A"]);
            expect(y.getDomain()).toEqual([0, 2]);

            // Exercise the restored collector subscription before another edit
            // gets a chance to rebind it.
            view.paramRuntime.setValue("multiplier", 1.5);
            await view.paramRuntime.whenPropagated();
            expect(y.getDomain()).toEqual([0, 3]);

            // Restored bindings must still follow data contributions and removal.
            await view.addChildSpec(structuredClone(addedLayer));
            expect(x.getDomain()).toEqual(["A", "B"]);
            expect(y.getDomain()).toEqual([0, 4]);
            await view.removeChildAt(1);
            expect(x.getDomain()).toEqual(["A"]);
            expect(y.getDomain()).toEqual([0, 3]);
        } finally {
            view.disposeSubtree();
        }
    });
});

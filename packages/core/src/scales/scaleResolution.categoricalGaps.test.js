import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

test("category-valued cuts settle with domain changes without changing retained IDs", async () => {
    const { view } = await createHeadlessEngine({
        width: { step: 20 },
        params: [
            { name: "order", value: ["A", "B", 20, "D"] },
            { name: "cuts", value: [20, 20, "absent"] },
        ],
        data: {
            values: ["A", "B", 20, "D"].map((category) => ({ category })),
        },
        mark: "rect",
        encoding: {
            x: {
                field: "category",
                type: "nominal",
                axis: /** @type {null} */ (null),
                scale: {
                    type: "band",
                    domain: { expr: "order" },
                    gapPositions: { expr: "cuts" },
                    gapWidth: 8,
                },
            },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    const resolution = view.getScaleResolution("x");
    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        resolution.getScale()
    );
    const indexer = /** @type {any} */ (scale.props).domainIndexer;
    const ids = scale.domain().map((value) => indexer(value));
    const observed = vi.fn(() => ({
        domain: resolution.getDomain(),
        cuts: scale.gapPositions(),
    }));
    onTestFinished(resolution.observeMapping(observed));
    expect(scale.gapPositions()).toEqual([2]);
    expect(view.getSize().width.px).toBe(88);

    view.paramRuntime.setValue("order", ["D", 20, "A", "B"]);
    expect(observed).toHaveBeenCalledOnce();
    expect(observed).toHaveLastReturnedWith({
        domain: ["D", 20, "A", "B"],
        cuts: [1],
    });
    expect(["A", "B", 20, "D"].map((value) => indexer(value))).toEqual(ids);
    expect(scale.gapMapping(88).position(20) * 88).toBeCloseTo(28);

    view.paramRuntime.setValue("order", ["D", "A", "B"]);
    expect(scale.gapPositions()).toEqual([]);
    expect(view.getSize().width.px).toBe(60);
    view.paramRuntime.setValue("order", [20, "D", "A", "B"]);
    expect(scale.gapPositions()).toEqual([]); // The first category has no preceding group.
    view.paramRuntime.setValue("order", ["A", "B", 20, "D"]);
    expect(scale.gapPositions()).toEqual([2]);
    expect(view.getSize().width.px).toBe(88);
});

test.each(["width / 10", "sizeAlias"])(
    "step-sized gap inputs reject graph-visible layout feedback: %s",
    async (expr) => {
        await expect(
            createHeadlessEngine({
                width: { step: 20 },
                params: [{ name: "sizeAlias", expr: "width / 10" }],
                data: { values: [{ category: "A" }, { category: "B" }] },
                mark: "point",
                encoding: {
                    x: {
                        field: "category",
                        type: "nominal",
                        axis: null,
                        scale: {
                            type: "point",
                            gapPositions: ["B"],
                            gapWidth: { expr },
                        },
                    },
                },
            })
        ).rejects.toThrow("cannot depend on its allocated width");
    }
);

test.each([
    ["band", true, false, "do not support round: true"],
    ["band", false, true, "Automatically fitted categorical offsets"],
    ["point", false, true, "requires a primary scale with nonzero bandwidth"],
])(
    "rejects unsupported %s scale configuration",
    async (type, round, offset, error) => {
        await expect(
            createHeadlessEngine({
                width: { step: 20 },
                data: {
                    values: [
                        { category: "A", group: "g" },
                        { category: "B", group: "h" },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: {
                        field: "category",
                        type: "nominal",
                        axis: null,
                        scale: {
                            type: /** @type {"band" | "point"} */ (type),
                            round,
                            gapPositions: ["B"],
                        },
                    },
                    xOffset: offset
                        ? { field: "group", type: "nominal" }
                        : undefined,
                },
            })
        ).rejects.toThrow(error);
    }
);

import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

test("category cuts follow active order and settle with the domain without changing retained IDs", async () => {
    const { view } = await createHeadlessEngine({
        width: { step: 20 },
        params: [
            { name: "order", value: ["A", "B", "C", "D"] },
            { name: "cuts", value: ["C", "C", "absent"] },
        ],
        data: {
            values: ["A", "B", "C", "D"].map((category) => ({ category })),
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

    view.paramRuntime.setValue("order", ["D", "C", "A", "B"]);
    expect(observed).toHaveBeenCalledOnce();
    expect(observed).toHaveLastReturnedWith({
        domain: ["D", "C", "A", "B"],
        cuts: [1],
    });
    expect(["A", "B", "C", "D"].map((value) => indexer(value))).toEqual(ids);
    expect(scale.gapMapping(88).position("C") * 88).toBeCloseTo(28);

    view.paramRuntime.setValue("order", ["D", "A", "B"]);
    expect(scale.gapPositions()).toEqual([]);
    expect(view.getSize().width.px).toBe(60);
    view.paramRuntime.setValue("order", ["C", "D", "A", "B"]);
    expect(scale.gapPositions()).toEqual([]); // The first category has no preceding group.
    view.paramRuntime.setValue("order", ["A", "B", "C", "D"]);
    expect(scale.gapPositions()).toEqual([2]);
    expect(view.getSize().width.px).toBe(88);
});

test("numeric band cuts name category values rather than numeric ranks", async () => {
    const { view } = await createHeadlessEngine({
        width: { step: 20 },
        data: {
            values: [{ category: 10 }, { category: 20 }, { category: 30 }],
        },
        mark: "rect",
        encoding: {
            x: {
                field: "category",
                type: "ordinal",
                axis: null,
                scale: {
                    type: "band",
                    domain: [10, 20, 30],
                    gapPositions: [20],
                    gapWidth: 8,
                },
            },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        view.getScaleResolution("x").getScale()
    );
    expect(scale.gapPositions()).toEqual([1]);
    expect(scale.gapMapping(68).position(20) * 68).toBeCloseTo(28);
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

test("an authored width parameter remains a valid external gap input", async () => {
    const { view } = await createHeadlessEngine({
        width: { step: 20 },
        params: [{ name: "width", value: 8 }],
        data: { values: [{ category: "A" }, { category: "B" }] },
        mark: "rect",
        encoding: {
            x: {
                field: "category",
                type: "nominal",
                axis: null,
                scale: {
                    type: "band",
                    gapPositions: ["B"],
                    gapWidth: { expr: "width" },
                },
            },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    expect(view.getSize().width.px).toBe(48);
});

test("categorical gaps reject unsupported rounding and automatically fitted offsets", async () => {
    const spec = /** @satisfies {import("../spec/view.js").UnitSpec} */ ({
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
                axis: /** @type {null} */ (null),
                scale: {
                    type: "band",
                    gapPositions: ["B"],
                    gapWidth: 8,
                },
            },
        },
    });
    await expect(
        createHeadlessEngine(
            /** @type {any} */ ({
                ...spec,
                encoding: {
                    x: {
                        ...spec.encoding.x,
                        scale: { ...spec.encoding.x.scale, round: true },
                    },
                },
            })
        )
    ).rejects.toThrow("do not support round: true");
    await expect(
        createHeadlessEngine(
            /** @type {any} */ ({
                ...spec,
                encoding: {
                    ...spec.encoding,
                    xOffset: { field: "group", type: "nominal" },
                },
            })
        )
    ).rejects.toThrow("Automatically fitted categorical offsets");
    const invalidPoint = createHeadlessEngine(
        /** @type {any} */ ({
            ...spec,
            width: { step: 20 },
            encoding: {
                x: {
                    ...spec.encoding.x,
                    scale: { ...spec.encoding.x.scale, type: "point" },
                },
                xOffset: { field: "group", type: "nominal" },
            },
        })
    );
    await expect(invalidPoint).rejects.toThrow(
        "requires a primary scale with nonzero bandwidth"
    );
});

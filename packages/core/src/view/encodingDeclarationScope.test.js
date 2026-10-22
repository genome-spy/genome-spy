import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

test("color normalization retains the inherited scale declaration's scope", async () => {
    const { view } = await createHeadlessEngine({
        params: [{ name: "order", value: ["A", "B"] }],
        data: { values: [{ category: "A" }, { category: "B" }] },
        encoding: {
            color: {
                field: "category",
                type: "nominal",
                scale: { domain: { expr: "order" } },
            },
        },
        layer: [
            {
                params: [{ name: "order", value: ["B", "A"] }],
                mark: { type: "point", filled: true },
            },
        ],
    });
    onTestFinished(() => view.disposeSubtree());
    const child = /** @type {import("./layerView.js").default} */ (view)
        .children[0];
    // Point normalization deep-clones color into fill and stroke definitions.
    expect(child.getScaleResolution("color").getDomain()).toEqual(["A", "B"]);
    child.paramRuntime.setValue("order", ["B", "A"]);
    await child.paramRuntime.whenPropagated();
    expect(child.getScaleResolution("color").getDomain()).toEqual(["A", "B"]);
    view.paramRuntime.setValue("order", ["B", "A"]);
    await view.paramRuntime.whenPropagated();
    expect(child.getScaleResolution("color").getDomain()).toEqual(["B", "A"]);
});

test("genomic rewrites preserve the inherited domain's authored scope", async () => {
    const { view } = await createHeadlessEngine({
        assembly: "hg38",
        params: [{ name: "upper", value: 200 }],
        data: { values: [{ chrom: "chr1", pos: 150 }] },
        encoding: {
            x: {
                chrom: "chrom",
                pos: "pos",
                type: "locus",
                scale: {
                    domain: {
                        expr: "[{chrom: 'chr1', pos: 100}, {chrom: 'chr1', pos: upper}]",
                    },
                },
            },
        },
        layer: [
            {
                params: [{ name: "upper", value: 400 }],
                mark: "point",
            },
        ],
    });
    onTestFinished(() => view.disposeSubtree());
    const child = /** @type {import("./layerView.js").default} */ (view)
        .children[0];
    expect(child.spec.encoding).toBeUndefined();
    expect(child.getScaleResolution("x").getDomain()).toEqual([100, 201]);
    child.paramRuntime.setValue("upper", 500);
    await child.paramRuntime.whenPropagated();
    expect(child.getScaleResolution("x").getDomain()).toEqual([100, 201]);
    view.paramRuntime.setValue("upper", 300);
    await view.paramRuntime.whenPropagated();
    expect(child.getScaleResolution("x").getDomain()).toEqual([100, 301]);
});

test("normalized aliases distinguish declarations that reuse one scale config", async () => {
    const scale = { domain: { expr: "order" } };
    const { view } = await createHeadlessEngine({
        params: [{ name: "order", value: ["A", "B"] }],
        data: { values: [{ category: "A" }, { category: "B" }] },
        encoding: {
            fill: { field: "category", type: "nominal", scale },
        },
        layer: [
            {
                params: [{ name: "order", value: ["B", "A"] }],
                encoding: {
                    color: { field: "category", type: "nominal", scale },
                },
                mark: { type: "point", filled: false },
            },
        ],
    });
    onTestFinished(() => view.disposeSubtree());
    const child = /** @type {import("./layerView.js").default} */ (view)
        .children[0];
    expect(child.getScaleResolution("fill").getDomain()).toEqual(["A", "B"]);
    expect(child.getScaleResolution("color").getDomain()).toEqual(["B", "A"]);
});

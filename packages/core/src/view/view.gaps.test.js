import { expect, onTestFinished, test, vi } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import GenomeStore from "../genome/genomeStore.js";

test.each([
    ["band", 96],
    ["point", 68],
])(
    "%s step sizing reserves categorical gaps in scrollable content",
    async (type, width) => {
        const requestLayoutReflow = vi.fn();
        const { view } = await createHeadlessEngine(
            {
                params: [
                    { name: "order", value: ["A", "B", "C", "D"] },
                    { name: "cuts", value: ["C"] },
                    { name: "gap", value: 8 },
                ],
                width: { step: 20 },
                height: 20,
                viewportWidth: 60,
                data: {
                    values: [{ x: "A" }, { x: "B" }, { x: "C" }, { x: "D" }],
                },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "nominal",
                        axis: null,
                        scale: {
                            type: /** @type {"band" | "point"} */ (type),
                            domain: { expr: "order" },
                            paddingInner: type === "band" ? 0.2 : undefined,
                            paddingOuter: type === "band" ? 0.3 : 0,
                            gapPositions: { expr: "cuts" },
                            gapWidth: { expr: "gap" },
                        },
                    },
                },
            },
            { contextOptions: { requestLayoutReflow } }
        );
        onTestFinished(() => view.disposeSubtree());

        expect(view.getSize().width.px).toBeCloseTo(width);
        expect(view.getViewportSize().width.px).toBe(60);
        const scale = /** @type {any} */ (
            view.getScaleResolution("x").getScale()
        );
        expect(scale.gapMapping(width).step * width).toBeCloseTo(20);
        expect(scale.gapMapping(width).bandwidth * width).toBeCloseTo(
            type === "band" ? 16 : 0
        );

        // Repeated post-scale configuration must not multiply mapping subscriptions.
        view.configurePostScaleParams();
        requestLayoutReflow.mockClear();
        view.paramRuntime.setValue("gap", 12);
        expect(view.getSize().width.px).toBeCloseTo(width + 4);
        expect(view.getViewportSize().width.px).toBe(60);
        expect(requestLayoutReflow).toHaveBeenCalledOnce();

        requestLayoutReflow.mockClear();
        view.paramRuntime.setValue("cuts", ["B"]);
        expect(view.getSize().width.px).toBeCloseTo(width + 4);
        expect(requestLayoutReflow).not.toHaveBeenCalled();

        view.paramRuntime.setValue("order", []);
        expect(view.getSize().width.px).toBe(0);
        expect(view.getViewportSize().width.px).toBe(60);
    }
);

test("index step sizing counts displayed gaps and retains its padded denominator at reactive zero", async () => {
    const requestLayoutReflow = vi.fn();
    const { view } = await createHeadlessEngine(
        {
            params: [{ name: "gap", value: 8 }],
            width: { step: 20 },
            data: { values: [{ x: 0 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "index",
                    axis: null,
                    scale: {
                        domain: [0, 0],
                        paddingInner: 0.8,
                        paddingOuter: 0,
                        gapPositions: [0, 1, 10],
                        gapWidth: { expr: "gap" },
                    },
                },
            },
        },
        { contextOptions: { requestLayoutReflow } }
    );
    onTestFinished(() => view.disposeSubtree());

    // None of the configured cuts is internal to this one-index domain.
    expect(view.getSize().width.px).toBe(20);
    requestLayoutReflow.mockClear();
    view.paramRuntime.setValue("gap", 0);
    expect(view.getSize().width.px).toBe(20);
    expect(requestLayoutReflow).not.toHaveBeenCalled();
});

test("index navigation updates step size through fractional edge gaps without changing numeric endpoints", async () => {
    const requestLayoutReflow = vi.fn();
    const { view } = await createHeadlessEngine(
        {
            width: { step: 10 },
            data: { values: [{ x: 0 }, { x: 19 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "index",
                    axis: null,
                    scale: {
                        domain: [9.9, 19.1],
                        zoom: { extent: "unbounded" },
                        gapPositions: [10, 20],
                        gapWidth: 6,
                    },
                },
            },
        },
        { contextOptions: { requestLayoutReflow } }
    );
    onTestFinished(() => view.disposeSubtree());
    const resolution = view.getScaleResolution("x");

    resolution.zoom(0.95, 0.5, 0, 100);
    expect(resolution.getScale().domain()).toEqual([10, 20]);
    const previousExtent = view.getSize().width.px;
    requestLayoutReflow.mockClear();

    resolution.zoom(0.9 / 0.95, 0.5, 0, 100);
    expect(resolution.getScale().domain()).toEqual([10, 20]);
    const extent = view.getSize().width.px;
    expect(extent).not.toBeCloseTo(previousExtent);
    const scale = /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
        resolution.getScale()
    );
    expect(Math.abs(scale.gapMapping(extent).step) * extent).toBeCloseTo(10);
    expect(requestLayoutReflow).toHaveBeenCalledOnce();
});

test("step observers do not initialize locus scales before guide assembly configuration", async () => {
    // This hierarchy intentionally stops before loading its URL-backed assembly.
    const { view } = await createHeadlessViewHierarchy(
        {
            width: { step: 10 },
            scales: {
                x: { type: "locus", assembly: { url: "unloaded.chrom.sizes" } },
            },
            mark: "point",
            encoding: { x: { chrom: "chrom", pos: "pos", type: "locus" } },
        },
        { contextOptions: { genomeStore: new GenomeStore(".") } }
    );
    onTestFinished(() => view.disposeSubtree());
    expect(view.getDataInitializationState()).toBe("none");
});

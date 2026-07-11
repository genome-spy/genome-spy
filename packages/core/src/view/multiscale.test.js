import { describe, expect, test } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewContext,
    prepareViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import { broadcastSubtreeDataReady } from "../data/flowInit.js";
import {
    attachViewLevelAxisConfigs,
    attachViewLevelLegendConfigs,
} from "../scales/viewLevelGuideConfig.js";
import { attachViewLevelScaleConfigs } from "../scales/viewLevelScaleConfig.js";
import Animator from "../utils/animator.js";
import LayerView from "./layerView.js";
import { isMultiscaleSpec, normalizeMultiscaleSpec } from "./multiscale.js";
import { getPostScaleParams } from "./postScaleParams.js";
import { renderToLayout } from "./testUtils.js";

/**
 * @param {import("../spec/mark.js").MarkType} mark
 * @returns {import("../spec/view.js").UnitSpec}
 */
function unit(mark) {
    return { mark };
}

/**
 * @param {import("../spec/view.js").LayerSpec | import("../spec/view.js").UnitSpec | import("../spec/view.js").MultiscaleSpec | import("../spec/view.js").ImportSpec} child
 * @returns {import("../spec/view.js").LayerSpec}
 */
function asLayer(child) {
    return /** @type {import("../spec/view.js").LayerSpec} */ (child);
}

/**
 * @param {import("./view.js").default} view
 * @returns {LayerView}
 */
function requireLayerView(view) {
    if (!(view instanceof LayerView)) {
        throw new Error("Expected a layer view.");
    }
    return view;
}

describe("multiscale", () => {
    test("isMultiscaleSpec detects multiscale specs", () => {
        expect(isMultiscaleSpec({ multiscale: [] })).toBe(true);
        expect(isMultiscaleSpec({ layer: [] })).toBe(false);
    });

    test("normalizes shorthand stops to generated layer wrappers", () => {
        const first = unit("point");
        const second = unit("rect");
        const third = unit("rule");

        const normalized = normalizeMultiscaleSpec({
            multiscale: [first, second, third],
            stops: [20000, 2000],
        });

        expect(normalized.layer).toHaveLength(3);
        expect(asLayer(normalized.layer[0]).layer[0]).toBe(first);
        expect(asLayer(normalized.layer[1]).layer[0]).toBe(second);
        expect(asLayer(normalized.layer[2]).layer[0]).toBe(third);

        expect(asLayer(normalized.layer[0]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [30000, 10000],
            values: [1, 0],
        });
        expect(asLayer(normalized.layer[1]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [30000, 10000, 3000, 1000],
            values: [0, 1, 1, 0],
        });
        expect(asLayer(normalized.layer[2]).opacity).toEqual({
            channel: "auto",
            unitsPerPixel: [3000, 1000],
            values: [0, 1],
        });
    });

    test("supports object stops with explicit channel and fade", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect")],
            stops: {
                metric: "unitsPerPixel",
                channel: "x",
                values: [1000],
                fade: 0.1,
            },
        });

        expect(asLayer(normalized.layer[0]).opacity).toEqual({
            channel: "x",
            unitsPerPixel: [1100, 900],
            values: [1, 0],
        });
        expect(asLayer(normalized.layer[1]).opacity).toEqual({
            channel: "x",
            unitsPerPixel: [1100, 900],
            values: [0, 1],
        });
    });

    test("generates transitioned stage opacities from discrete stop targets", () => {
        /** @type {import("../spec/parameter.js").LerpTransition} */
        const transition = { type: "lerp", halfLife: 60 };
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: {
                channel: "x",
                values: [1000, 100],
                transition,
            },
        });

        expect(asLayer(normalized.layer[0])).toMatchObject({
            opacity: { expr: "multiscaleOpacity" },
        });
        expect(getPostScaleParams(normalized.layer[0])).toEqual([
            {
                name: "multiscaleOpacity",
                expr: "abs(span(domain('x'))) / max(width, 1) >= 1000 ? 1 : 0",
                transition,
            },
        ]);
        expect(getPostScaleParams(normalized.layer[1])).toEqual([
            {
                name: "multiscaleOpacity",
                expr: "abs(span(domain('x'))) / max(width, 1) < 1000 && abs(span(domain('x'))) / max(width, 1) >= 100 ? 1 : 0",
                transition,
            },
        ]);
        expect(getPostScaleParams(normalized.layer[2])).toEqual([
            {
                name: "multiscaleOpacity",
                expr: "abs(span(domain('x'))) / max(width, 1) < 100 ? 1 : 0",
                transition,
            },
        ]);
    });

    test("requires an explicit channel for transitioned stops", () => {
        expect(() =>
            normalizeMultiscaleSpec(
                /** @type {any} */ ({
                    multiscale: [unit("point"), unit("rect")],
                    stops: {
                        values: [1000],
                        transition: { type: "lerp" },
                    },
                })
            )
        ).toThrow('Transitioned multiscale stops require "stops.channel"');
    });

    test("prefers transitioned stops over zoom-space fades", () => {
        const normalized = normalizeMultiscaleSpec(
            /** @type {any} */ ({
                multiscale: [unit("point"), unit("rect")],
                stops: {
                    channel: "x",
                    values: [1000],
                    fade: 1,
                    transition: { type: "lerp" },
                },
            })
        );

        expect(asLayer(normalized.layer[0]).opacity).toEqual({
            expr: "multiscaleOpacity",
        });
    });

    test("initializes transitioned stage opacity from the zoom threshold", async () => {
        const { view: rawView } = await createHeadlessEngine({
            width: 100,
            data: { values: [{ x: 0, y: 0 }] },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 5] },
                },
                y: { field: "y", type: "quantitative" },
            },
            stops: {
                channel: "x",
                values: [10],
                transition: { type: "lerp" },
            },
            multiscale: [unit("point"), unit("rect")],
        });
        const view = requireLayerView(rawView);

        expect(
            view.children[0].paramRuntime.getValue("multiscaleOpacity")
        ).toBe(0);
        expect(
            view.children[1].paramRuntime.getValue("multiscaleOpacity")
        ).toBe(1);

        await view.getScaleResolution("x").zoomTo([0, 2000], 0);

        expect(
            view.children[0].paramRuntime.getValue("multiscaleOpacity")
        ).toBe(1);
        expect(
            view.children[1].paramRuntime.getValue("multiscaleOpacity")
        ).toBe(0);
    });

    test("snaps transitioned stage opacity after the first layout", async () => {
        const animator = new Animator(() => undefined);
        animator.requestRender = () => undefined;

        const context = createHeadlessViewContext({ animator });
        const rawView = await context.createOrImportView(
            {
                width: 100,
                data: { values: [{ x: 0, y: 0 }] },
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 5] },
                    },
                    y: { field: "y", type: "quantitative" },
                },
                stops: {
                    channel: "x",
                    values: [0.1],
                    transition: { type: "lerp" },
                },
                multiscale: [unit("point"), unit("rect")],
            },
            null,
            null,
            "root"
        );
        const view = requireLayerView(rawView);
        attachViewLevelScaleConfigs(view);
        attachViewLevelAxisConfigs(view);
        attachViewLevelLegendConfigs(view);
        prepareViewHierarchy(view);

        // Simulate the first layout arriving before the subtree finishes loading.
        renderToLayout(view);

        expect(
            view.children[0].paramRuntime.getValue("multiscaleOpacity")
        ).toBe(0);
        expect(
            view.children[1].paramRuntime.getValue("multiscaleOpacity")
        ).toBe(1);
        expect(animator.transitions).toHaveLength(0);

        broadcastSubtreeDataReady(view);
        await view.getScaleResolution("x").zoomTo([0, 2000], 0);

        expect(animator.transitions).toHaveLength(2);
    });

    test("supports mixed constants and ExprRefs in top-level stops", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: [5000, { expr: "windowSize / max(width, 1)" }],
        });

        const firstOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[0]).opacity
            );
        const secondOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[1]).opacity
            );

        expect(firstOpacity.unitsPerPixel).toEqual([7500, 2500]);
        expect(secondOpacity.unitsPerPixel).toEqual([
            7500,
            2500,
            { expr: "(windowSize / max(width, 1)) * 1.5" },
            { expr: "(windowSize / max(width, 1)) * 0.5" },
        ]);
    });

    test("supports top-level array of ExprRefs for stops", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: [{ expr: "outerStop" }, { expr: "innerStop" }],
        });

        const middleOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[1]).opacity
            );
        expect(middleOpacity.unitsPerPixel).toEqual([
            { expr: "(outerStop) * 1.5" },
            { expr: "(outerStop) * 0.5" },
            { expr: "(innerStop) * 1.5" },
            { expr: "(innerStop) * 0.5" },
        ]);
    });

    test("supports mixed constants and ExprRefs in object stop values", () => {
        const normalized = normalizeMultiscaleSpec({
            multiscale: [unit("point"), unit("rect"), unit("rule")],
            stops: {
                metric: "unitsPerPixel",
                values: [6000, { expr: "innerStop" }],
            },
        });

        const middleOpacity =
            /** @type {import("../spec/view.js").DynamicOpacity} */ (
                asLayer(normalized.layer[1]).opacity
            );
        expect(middleOpacity.unitsPerPixel).toEqual([
            9000,
            3000,
            { expr: "(innerStop) * 1.5" },
            { expr: "(innerStop) * 0.5" },
        ]);
    });

    test("fails if top-level ExprRef stop array has invalid length", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect"), unit("rule")],
                stops: [{ expr: "onlyOneStop" }],
            })
        ).toThrow("Invalid stop count");
    });

    test("fails if top-level stops is a single ExprRef", () => {
        const invalidStops = /** @type {any} */ ({ expr: "[1000]" });

        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect")],
                stops: invalidStops,
            })
        ).toThrow('"stops.values" must be an array of numbers or ExprRefs.');
    });

    test("keeps a single level as a plain child", () => {
        const child = unit("point");
        const normalized = normalizeMultiscaleSpec({
            multiscale: [child],
            stops: [],
        });

        expect(normalized.layer).toEqual([child]);
    });

    test("fails on mismatching stop and stage count", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect"), unit("rule")],
                stops: [1000],
            })
        ).toThrow("Invalid stop count");
    });

    test("fails on overlapping transitions", () => {
        expect(() =>
            normalizeMultiscaleSpec({
                multiscale: [unit("point"), unit("rect"), unit("rule")],
                stops: {
                    metric: "unitsPerPixel",
                    values: [10, 9],
                    fade: 0.15,
                },
            })
        ).toThrow("Adjacent transitions overlap");
    });
});

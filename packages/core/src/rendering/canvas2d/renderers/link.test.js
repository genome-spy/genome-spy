// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import {
    createSinglePointSelection,
    createMultiPointSelection,
} from "../../../selection/selection.js";
import Rectangle from "../../../view/layout/rectangle.js";
import { createSvg } from "../../svg/index.js";
import SoftwarePickingBuffer from "../picking/softwarePickingBuffer.js";
import SoftwarePickingRasterizer from "../picking/softwarePickingRasterizer.js";
import SoftwarePickingViewRenderingContext from "../picking/softwarePickingViewRenderingContext.js";
import { renderLinkCanvas } from "./link.js";

// Use nonzero baselines in both directions so the apex cannot masquerade as an endpoint.
test.each([
    ["dome", "vertical", 0.9, 0.2, [0, 55, 0, 105], [50, 10]],
    ["dome", "vertical", 0.1, 0.8, [0, -5, 0, 45], [50, 90]],
    ["dome", "horizontal", 0.1, 0.8, [55, 0, 105, 0], [10, 50]],
    ["dome", "horizontal", 0.9, 0.2, [-5, 0, 45, 0], [90, 50]],
    ["arc", "vertical", 0.2, 0.2, [0, 55, 0, 105], [50, 40]],
])(
    "fades %s %s links from %s to %s consistently in Canvas, SVG, and picking",
    async (shape, orient, apex, baseline, gradientCoords, apexCoords) => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            params: [
                { name: "fade", value: [10, 25] },
                { name: "bypass", value: true },
                {
                    name: "selected",
                    select: {
                        type: "point",
                        on: orient == "vertical" ? "mousemove" : "click",
                    },
                },
            ],
            mark: {
                type: "link",
                linkShape: /** @type {"arc" | "dome"} */ (shape),
                orient: /** @type {"vertical" | "horizontal"} */ (orient),
                arcFadingDistance: { expr: "fade" },
                noFadingOnPointSelection: { expr: "bypass" },
            },
            encoding: {
                x: { value: orient == "vertical" ? 0.1 : apex },
                x2: { value: orient == "vertical" ? 0.9 : baseline },
                y: { value: orient == "vertical" ? apex : 0.1 },
                y2: { value: orient == "vertical" ? baseline : 0.9 },
                color: {
                    value: "red",
                    condition: { param: "selected", value: "red" },
                },
                size: { value: 3 },
            },
        });
        const mark =
            /** @type {import("../../../view/unitView.js").default} */ (view)
                .mark;
        const datum = mark.unitView
            .getCollector()
            .facetBatches.get(undefined)[0];
        const draw = () => renderLinkOutputs(view);
        const faded = draw();
        expect(
            faded.context.createLinearGradient.mock.calls[0].map(
                (/** @type {number} */ value) => value + 0
            )
        ).toEqual(gradientCoords);
        const gradient = faded.svg.querySelector("linearGradient");
        expect(
            ["x1", "y1", "x2", "y2"].map((attr) => +gradient.getAttribute(attr))
        ).toEqual(gradientCoords);
        expect(faded.stops[0][1]).toBe("rgba(255, 0, 0, 0)");
        expect(faded.stops[2][1]).toBe("rgba(255, 0, 0, 0.5)");
        expect(faded.buffer.read(apexCoords[0], apexCoords[1])).toBe(0);
        expect(faded.buffer.ids.some((id) => id > 0)).toBe(true);

        const selection =
            orient == "vertical"
                ? createSinglePointSelection(datum)
                : createMultiPointSelection([datum]);
        view.paramRuntime.setValue("selected", selection);
        const selected = draw();
        expect(selected.context.createLinearGradient).not.toHaveBeenCalled();
        expect(selected.svg.querySelector("mask")).toBeNull();
        expect(
            selected.buffer.read(apexCoords[0], apexCoords[1])
        ).toBeGreaterThan(0);
        view.paramRuntime.setValue("bypass", false);
        expect(draw().buffer.read(apexCoords[0], apexCoords[1])).toBe(0);

        for (const disabled of [false, [0, 0], [-1, 25]]) {
            view.paramRuntime.setValue("fade", disabled);
            const unfaded = draw();
            expect(unfaded.context.createLinearGradient).not.toHaveBeenCalled();
            expect(unfaded.svg.querySelector("mask")).toBeNull();
            expect(
                unfaded.buffer.read(apexCoords[0], apexCoords[1])
            ).toBeGreaterThan(0);
        }
        view.paramRuntime.setValue("fade", [5, 15]);
        expect(draw().context.createLinearGradient).toHaveBeenCalledOnce();
    }
);

/** @param {import("../../../view/view.js").default} view */
function renderLinkOutputs(view) {
    const mark = /** @type {import("../../../view/unitView.js").default} */ (
        view
    ).mark;
    const datum = mark.unitView.getCollector().facetBatches.get(undefined)[0];
    const addColorStop = vi.fn();
    const context = /** @type {any} */ ({
        createLinearGradient: vi.fn(() => ({ addColorStop })),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        stroke: vi.fn(),
    });
    const warn = vi.fn();
    renderLinkCanvas(mark, {
        context,
        warn,
        devicePixelRatio: 1,
        anchorCullBounds: { x1: 0, y1: 0, x2: 100, y2: 100 },
        coords: Rectangle.create(0, 0, 100, 100),
        data: [datum],
        viewOpacity: 1,
        visibleBounds: { x1: 0, y1: 0, x2: 100, y2: 100 },
    });
    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 100,
        logicalHeight: 100,
    });
    expect(warnings).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    const buffer = new SoftwarePickingBuffer(100, 100);
    view.arrange(
        new SoftwarePickingViewRenderingContext({
            width: 100,
            height: 100,
            devicePixelRatio: 1,
            getRasterizer: () => new SoftwarePickingRasterizer(buffer),
        }),
        Rectangle.create(0, 0, 100, 100),
        { firstFacet: true }
    );
    return { context, svg, buffer, stops: addColorStop.mock.calls };
}

test.each([true, false])(
    "interval fading bypass preserves endpoint tests and picking participation (%s)",
    async (picking) => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ start: 90, end: 10, apex: 90, base: 20 }] },
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x", "y"] },
                },
                {
                    name: "unreferenced",
                    select: { type: "interval", encodings: ["x"] },
                },
                { name: "bypass", value: true },
            ],
            mark: {
                type: "link",
                linkShape: "dome",
                arcFadingDistance: [10, 25],
                noFadingOnPointSelection: { expr: "bypass" },
                ...(picking ? {} : { tooltip: null }),
            },
            encoding: {
                x: {
                    field: "start",
                    type: "quantitative",
                    scale: { domain: [0, 100] },
                    axis: null,
                },
                x2: { field: "end" },
                y: {
                    field: "apex",
                    type: "quantitative",
                    scale: { domain: [0, 100] },
                    axis: null,
                },
                y2: { field: "base" },
                size: { value: 3 },
                color: {
                    value: "red",
                    condition: { param: "brush", empty: true, value: "red" },
                },
            },
        });
        // An unrelated selection must not affect a mark's fading.
        view.paramRuntime.setValue("unreferenced", {
            type: "interval",
            intervals: { x: [0, 100] },
        });
        /** @param {number[] | null} x @param {number[] | null} y @param {boolean} member */
        const check = (x, y, member) => {
            view.paramRuntime.setValue("brush", {
                type: "interval",
                intervals: { x, y },
            });
            const result = renderLinkOutputs(view);
            const bypass =
                picking && member && view.paramRuntime.getValue("bypass");
            expect(result.context.createLinearGradient).toHaveBeenCalledTimes(
                bypass ? 0 : 1
            );
            expect(result.svg.querySelectorAll("mask")).toHaveLength(
                bypass ? 0 : 1
            );
            expect(result.buffer.read(50, 10) > 0).toBe(!!bypass);
        };
        check(null, null, false);
        check([40, 60], [0, 100], false); // Crossing the span is insufficient.
        check([85, 95], [85, 95], true); // Primary endpoint; values are in data space.
        check([5, 15], [15, 25], true); // Secondary endpoint and reversed x order.
        check([85, 95], [40, 60], false); // All selected dimensions must match.
        check([85, 95], null, false);
        check([0, 5], [0, 100], false);
        view.paramRuntime.setValue("bypass", false);
        check([85, 95], [85, 95], true);
    }
);

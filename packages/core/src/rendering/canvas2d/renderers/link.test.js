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
import Canvas2DViewRenderingContext from "../canvas2DViewRenderingContext.js";

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
                order: {
                    condition: { param: "selected", empty: false, value: 1 },
                    value: 0,
                },
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
        expect(selected.buffer.read(apexCoords[0], apexCoords[1])).toBe(0);
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
    const addColorStop = vi.fn();
    const context = /** @type {any} */ ({
        canvas: { width: 100, height: 100 },
        save: vi.fn(),
        restore: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        createLinearGradient: vi.fn(() => ({ addColorStop })),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        stroke: vi.fn(),
    });
    view.arrange(
        new Canvas2DViewRenderingContext(
            { picking: false },
            {
                context,
                width: 100,
                height: 100,
                devicePixelRatio: 1,
                background: null,
                paint: true,
            }
        ),
        Rectangle.create(0, 0, 100, 100),
        { firstFacet: true }
    );
    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 100,
        logicalHeight: 100,
    });
    expect(warnings).toEqual([]);
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

// The deprecated spelling is only an alias; explicit new values take precedence.
test.each([
    [{}, false],
    [{ noFadingOnPointSelection: true }, true],
    [{ noFadingOnPointSelection: true, noFadingOnSecondPass: false }, false],
])("normalizes fading options %j", async (properties, expected) => {
    const { view } = await createHeadlessEngine({
        data: { values: [{}] },
        mark: { type: "link", ...properties },
    });
    const mark = /** @type {import("../../../view/unitView.js").default} */ (
        view
    ).mark;
    expect(
        /** @type {import("../../../spec/mark.js").LinkProps} */ (
            mark.properties
        ).noFadingOnSecondPass
    ).toBe(expected);
});

// One datum also exercises an empty first partition: pass identity must not shift.
test.each([0, 1, null])(
    "fading follows order level %s, not membership",
    async (level) => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            params: [
                { name: "picked", select: { type: "point", on: "mousemove" } },
            ],
            mark: {
                type: "link",
                arcFadingDistance: [10, 25],
                noFadingOnSecondPass: true,
            },
            encoding: {
                color: { value: "red" },
                size: { value: 3 },
                x: { value: 0.1 },
                x2: { value: 0.9 },
                y: { value: 0.2 },
                y2: { value: 0.2 },
                ...(level === null
                    ? {}
                    : {
                          order: {
                              condition: {
                                  param: "picked",
                                  empty: false,
                                  value: level,
                              },
                              value: 1 - level,
                          },
                      }),
            },
        });
        const mark =
            /** @type {import("../../../view/unitView.js").default} */ (view)
                .mark;
        const datum = mark.unitView
            .getCollector()
            .facetBatches.get(undefined)[0];
        /** @param {boolean} unfaded */
        const check = (unfaded) => {
            const result = renderLinkOutputs(view);
            expect(result.context.createLinearGradient).toHaveBeenCalledTimes(
                unfaded ? 0 : 1
            );
            expect(result.svg.querySelectorAll("mask")).toHaveLength(
                unfaded ? 0 : 1
            );
            expect(result.buffer.read(50, 40)).toBe(0);
        };
        check(false);
        view.paramRuntime.setValue("picked", createSinglePointSelection(datum));
        check(level === 1);
        view.paramRuntime.setValue(
            "picked",
            createSinglePointSelection({ __uniqueId: 999 })
        );
        check(level === 0);
        view.paramRuntime.setValue("picked", createSinglePointSelection(null));
        check(false);
    }
);

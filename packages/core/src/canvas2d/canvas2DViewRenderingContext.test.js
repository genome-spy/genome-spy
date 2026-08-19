// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import Rectangle from "../view/layout/rectangle.js";
import Canvas2DViewRenderingContext from "./canvas2DViewRenderingContext.js";

function createRecordingContext() {
    /**
     * @type {{
     *     arcs: [number, number, number][],
     *     rects: [number, number, number, number][],
     *     fillRects: [number, number, number, number][],
     *     moves: [number, number][],
     *     lines: [number, number][],
     *     beziers: [number, number, number, number, number, number][],
     *     translates: [number, number][],
     *     rotations: number[],
     *     fillTexts: [string, number, number, number | undefined][],
     *     scales: [number, number][],
     *     closes: number,
     *     saves: number
     * }}
     */
    const calls = {
        arcs: [],
        rects: [],
        fillRects: [],
        moves: [],
        lines: [],
        beziers: [],
        translates: [],
        rotations: [],
        fillTexts: [],
        scales: [],
        closes: 0,
        saves: 0,
    };
    const context = /** @type {any} */ ({
        canvas: { width: 200, height: 100 },
        fillStyle: "#000000",
        strokeStyle: "#000000",
        globalAlpha: 1,
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        lineDashOffset: 0,
        font: "",
        textAlign: "start",
        textBaseline: "alphabetic",
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: () => calls.saves++,
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: (
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ width,
            /** @type {number} */ height
        ) => calls.rects.push([x, y, width, height]),
        clip: vi.fn(),
        moveTo: (/** @type {number} */ x, /** @type {number} */ y) =>
            calls.moves.push([x, y]),
        lineTo: (/** @type {number} */ x, /** @type {number} */ y) =>
            calls.lines.push([x, y]),
        bezierCurveTo: (
            /** @type {number} */ x1,
            /** @type {number} */ y1,
            /** @type {number} */ x2,
            /** @type {number} */ y2,
            /** @type {number} */ x3,
            /** @type {number} */ y3
        ) => calls.beziers.push([x1, y1, x2, y2, x3, y3]),
        closePath: () => calls.closes++,
        setLineDash: vi.fn(),
        fillRect: (
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ width,
            /** @type {number} */ height
        ) => calls.fillRects.push([x, y, width, height]),
        strokeRect: vi.fn(),
        translate: (/** @type {number} */ x, /** @type {number} */ y) =>
            calls.translates.push([x, y]),
        rotate: (/** @type {number} */ angle) => calls.rotations.push(angle),
        scale: (/** @type {number} */ x, /** @type {number} */ y) =>
            calls.scales.push([x, y]),
        measureText: vi.fn(() => ({ width: 0.5 })),
        fillText: (
            /** @type {string} */ text,
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number | undefined} */ maxWidth
        ) => calls.fillTexts.push([text, x, y, maxWidth]),
        arc: (
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ radius
        ) => calls.arcs.push([x, y, radius]),
        fill: vi.fn(),
        stroke: vi.fn(),
    });
    return { calls, context };
}

function render(
    /** @type {import("../view/view.js").default} */ view,
    /** @type {CanvasRenderingContext2D} */ context
) {
    view.render(
        new Canvas2DViewRenderingContext(
            { picking: false },
            {
                context,
                width: 100,
                height: 100,
                devicePixelRatio: 2,
                background: null,
                paint: true,
            }
        ),
        Rectangle.create(0, 0, 100, 100),
        { firstFacet: true }
    );
}

describe("Canvas2DViewRenderingContext", () => {
    test("reprojects rectangles from the current scale domain", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0, x2: 1 },
                    { x: 1, x2: 2 },
                ],
            },
            mark: "rect",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 2] },
                },
                x2: { field: "x2" },
                y: { value: 0 },
                y2: { value: 1 },
                fill: { value: "black" },
            },
        });
        const first = createRecordingContext();
        render(view, first.context);

        expect(first.context.setTransform).toHaveBeenCalledWith(
            2,
            0,
            0,
            2,
            0,
            0
        );
        expect(first.calls.fillRects).toHaveLength(2);
        expect(first.calls.fillRects[0][2]).toBeCloseTo(50.2);

        view.getScaleResolution("x").getScale().domain([0, 1]);
        const zoomed = createRecordingContext();
        render(view, zoomed.context);

        expect(zoomed.calls.fillRects[0][2]).toBeCloseTo(100.2);
        expect(zoomed.calls.fillRects[1][0]).toBeCloseTo(99.9);
    });

    test("draws points without per-datum save scopes", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 0.25 }, { x: 0.75 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 1] },
                },
                y: { value: 0.5 },
                size: { value: 400 },
                fill: { value: "black" },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.calls.arcs).toEqual([
            [25, 50, 10],
            [75, 50, 10],
        ]);
        expect(recording.calls.saves).toBe(1);
        expect(recording.context.fill).toHaveBeenCalledTimes(2);
    });

    test("draws and rotates every point shape", async () => {
        const shapes = [
            "circle",
            "square",
            "cross",
            "diamond",
            "triangle-up",
            "triangle-right",
            "triangle-down",
            "triangle-left",
            "tick-up",
            "tick-right",
            "tick-down",
            "tick-left",
            "x",
            "+",
        ];
        const { view } = await createHeadlessEngine({
            data: {
                values: shapes.map((shape, index) => ({
                    shape,
                    x: (index + 1) / (shapes.length + 1),
                })),
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                shape: { field: "shape", type: "nominal", scale: null },
                angle: { value: 15 },
                size: { value: 400 },
                fill: { value: "#123456" },
                stroke: { value: "#654321" },
                strokeWidth: { value: 2 },
            },
        });
        const recording = createRecordingContext();
        recording.context.lineCap = "round";
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        try {
            render(view, recording.context);

            expect(recording.calls.arcs).toHaveLength(1);
            expect(recording.calls.rects).toHaveLength(1);
            expect(recording.calls.moves).toHaveLength(14);
            expect(recording.calls.lines).toHaveLength(38);
            expect(recording.calls.closes).toBe(10);
            expect(recording.calls.rotations).toEqual(
                Array(13).fill(Math.PI / 12)
            );
            expect(recording.context.fill).toHaveBeenCalledTimes(12);
            expect(recording.context.stroke).toHaveBeenCalledTimes(14);
            expect(recording.context.lineCap).toBe("butt");
            expect(warn).not.toHaveBeenCalledWith(
                expect.stringContaining("unsupported point")
            );
        } finally {
            warn.mockRestore();
        }
    });

    test("projects repeated sample facets into their assigned rows", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: "point",
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                size: { value: 100 },
                fill: { value: "black" },
            },
        });
        const recording = createRecordingContext();
        const context = new Canvas2DViewRenderingContext(
            { picking: false },
            {
                context: recording.context,
                width: 100,
                height: 100,
                devicePixelRatio: 1,
                background: null,
                paint: true,
            }
        );

        for (const locSize of [
            { location: 20, size: 40 },
            { location: 60, size: 20 },
        ]) {
            view.render(context, Rectangle.create(0, 0, 100, 100), {
                sampleFacetRenderingOptions: {
                    locSize,
                    pixelToUnit: 0.01,
                },
                clip: {
                    rect: Rectangle.create(0, 10, 100, 80),
                    clipX: true,
                    clipY: true,
                },
            });
        }

        expect(recording.calls.arcs).toEqual([
            [50, 40, 5],
            [50, 70, 5],
        ]);
        expect(recording.context.clip).toHaveBeenCalledTimes(2);
    });

    test("warns once while drawing the supported base rectangle", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: 5,
                hatch: "diagonal",
                shadowBlur: 10,
                shadowOpacity: 0.5,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "black" },
            },
        });
        const recording = createRecordingContext();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        try {
            render(view, recording.context);
            const warnings = warn.mock.calls.map(([message]) => "" + message);
            expect(recording.calls.fillRects).toHaveLength(1);
            expect(warnings).toEqual(
                expect.arrayContaining([
                    expect.stringContaining("unsupported rect hatch"),
                    expect.stringContaining("unsupported rect shadow"),
                    expect.stringContaining("unsupported rect corner radius"),
                ])
            );
        } finally {
            warn.mockRestore();
        }
    });

    test("records exact rule and link paths", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            layer: [
                {
                    mark: { type: "rule", strokeCap: "round" },
                    encoding: {
                        x: { value: 0.1 },
                        x2: { value: 0.9 },
                        y: { value: 0.25 },
                        y2: { value: 0.25 },
                        color: { value: "black" },
                        size: { value: 2 },
                    },
                },
                {
                    mark: {
                        type: "link",
                        linkShape: "diagonal",
                        orient: "vertical",
                    },
                    encoding: {
                        x: { value: 0.1 },
                        x2: { value: 0.9 },
                        y: { value: 0.2 },
                        y2: { value: 0.8 },
                        color: { value: "black" },
                        size: { value: 3 },
                    },
                },
            ],
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.calls.moves).toEqual([
            [10, 75],
            [10, 80],
        ]);
        expect(recording.calls.lines).toEqual([[90, 75]]);
        expect(recording.calls.beziers).toEqual([[10, 50, 90, 50, 90, 20]]);
        expect(recording.context.setLineDash).toHaveBeenCalledWith([]);
    });

    test("records text rotation, alignment, and offset", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "text",
                align: "right",
                baseline: "top",
                dx: 3,
                dy: 4,
            },
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                text: { value: "T" },
                angle: { value: 90 },
                color: { value: "black" },
                size: { value: 12 },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.calls.translates).toEqual([[50, 50]]);
        expect(recording.calls.rotations).toEqual([Math.PI / 2]);
        expect(recording.calls.fillTexts[0].slice(0, 3)).toEqual(["T", 3, 4]);
        expect(recording.context.textAlign).toBe("right");
        expect(recording.context.textBaseline).toBe("top");
    });

    test("records closed arrow boundaries beginning at its tip", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: "arrow",
            encoding: {
                x: { value: 0.1 },
                x2: { value: 0.9 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                fill: { value: "black" },
                size: { value: 6 },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.calls.moves[0]).toEqual([90, 50]);
        expect(recording.calls.lines.length).toBeGreaterThanOrEqual(4);
        expect(recording.calls.closes).toBe(2);
        expect(recording.context.fill).toHaveBeenCalledTimes(1);
    });

    test("normalizes reversed logo-letter cells by the measured glyph width", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: { type: "text", logoLetters: true },
            encoding: {
                x: { value: 0.8 },
                x2: { value: 0.2 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                text: { value: "A" },
                color: { value: "black" },
                size: { value: 10 },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.context.measureText).toHaveBeenCalledWith("A");
        expect(recording.calls.scales[0][0]).toBeCloseTo(-120);
        expect(recording.calls.fillTexts).toEqual([["A", 0, 0, undefined]]);
    });
});

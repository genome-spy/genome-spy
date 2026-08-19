// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../view/layout/rectangle.js";
import Canvas2DViewRenderingContext from "./canvas2DViewRenderingContext.js";

function createRecordingContext() {
    /**
     * @type {{
     *     arcs: [number, number, number][],
     *     roundRects: [number, number, number, number, number[]][],
     *     rects: [number, number, number, number][],
     *     fillRects: [number, number, number, number][],
     *     fills: [number, string][],
     *     strokes: [number, string][],
     *     moves: [number, number][],
     *     lines: [number, number][],
     *     beziers: [number, number, number, number, number, number][],
     *     translates: [number, number][],
     *     rotations: number[],
     *     fillTexts: [string, number, number, number | undefined][],
     *     fonts: string[],
     *     scales: [number, number][],
     *     closes: number,
     *     saves: number
     * }}
     */
    const calls = {
        arcs: [],
        roundRects: [],
        rects: [],
        fillRects: [],
        fills: [],
        strokes: [],
        moves: [],
        lines: [],
        beziers: [],
        translates: [],
        rotations: [],
        fillTexts: [],
        fonts: [],
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
        roundRect: (
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ width,
            /** @type {number} */ height,
            /** @type {number[]} */ radii
        ) => calls.roundRects.push([x, y, width, height, Array.from(radii)]),
        fill: vi.fn(() =>
            calls.fills.push([context.globalAlpha, "" + context.fillStyle])
        ),
        stroke: vi.fn(() =>
            calls.strokes.push([context.globalAlpha, "" + context.strokeStyle])
        ),
    });
    let font = "";
    Object.defineProperty(context, "font", {
        get: () => font,
        set: (value) => {
            font = value;
            calls.fonts.push(value);
        },
    });
    return { calls, context };
}

function render(
    /** @type {import("../../view/view.js").default} */ view,
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
            expect(recording.calls.saves).toBe(14);
            expect(recording.context.restore).toHaveBeenCalledTimes(14);
            expect(recording.calls.translates).toHaveLength(13);
            expect(recording.calls.translates[0][0]).toBeCloseTo(200 / 15);
            expect(recording.calls.translates[0][1]).toBe(50);
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

    test("uses fill as the stroke of line-only point shapes", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { shape: "x", x: 0.25 },
                    { shape: "+", x: 0.75 },
                ],
            },
            mark: {
                type: "point",
                fill: "#123456",
                stroke: null,
                strokeWidth: 4,
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                shape: { field: "shape", type: "nominal", scale: null },
                size: { value: 400 },
            },
        });
        const recording = createRecordingContext();
        recording.context.lineCap = "round";

        render(view, recording.context);

        expect(recording.context.fill).not.toHaveBeenCalled();
        expect(recording.context.stroke).toHaveBeenCalledTimes(2);
        expect(recording.context.strokeStyle).toBe("#123456");
        expect(recording.context.lineWidth).toBe(4);
        expect(recording.context.lineCap).toBe("butt");
        expect(recording.calls.moves).toHaveLength(4);
        expect(recording.calls.lines).toHaveLength(4);
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

    test("draws rounded rectangles while warning about other effects", async () => {
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
            expect(recording.calls.fillRects).toHaveLength(0);
            expect(recording.calls.roundRects).toHaveLength(1);
            expect(recording.calls.roundRects[0].slice(0, 4)).toEqual([
                20,
                expect.closeTo(20),
                60,
                60,
            ]);
            expect(recording.calls.roundRects[0][4]).toEqual([5, 5, 5, 5]);
            expect(recording.context.fill).toHaveBeenCalledOnce();
            expect(warnings).toEqual(
                expect.arrayContaining([
                    expect.stringContaining("unsupported rect hatch"),
                    expect.stringContaining("unsupported rect shadow"),
                ])
            );
            expect(warnings).not.toEqual(
                expect.arrayContaining([
                    expect.stringContaining("unsupported rect corner radius"),
                ])
            );
        } finally {
            warn.mockRestore();
        }
    });

    test("evaluates constant rect encoders once per render", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.1, x2: 0.4, fillOpacity: 0.25 },
                    { x: 0.6, x2: 0.9, fillOpacity: 0.75 },
                ],
            },
            mark: {
                type: "rect",
                cornerRadius: 1,
                stroke: "black",
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                x2: { field: "x2" },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "black" },
            },
        });
        const encoders =
            /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
                /** @type {import("../../view/unitView.js").default} */ (view)
                    .mark.encoders
            );
        let strokeWidth = 1;
        const strokeWidthEncoder = Object.assign(
            vi.fn(() => strokeWidth),
            encoders.strokeWidth
        );
        const fillOpacityEncoder = Object.assign(
            vi.fn((datum) => datum.fillOpacity),
            encoders.fillOpacity,
            { constant: false }
        );
        encoders.strokeWidth = strokeWidthEncoder;
        encoders.fillOpacity = fillOpacityEncoder;

        const first = createRecordingContext();
        render(view, first.context);

        expect(strokeWidthEncoder).toHaveBeenCalledOnce();
        expect(fillOpacityEncoder).toHaveBeenCalledTimes(2);
        expect(first.calls.fills.map(([opacity]) => opacity)).toEqual([
            0.25, 0.75,
        ]);
        expect(first.context.lineWidth).toBe(1);

        strokeWidth = 3;
        const second = createRecordingContext();
        render(view, second.context);

        expect(strokeWidthEncoder).toHaveBeenCalledTimes(2);
        expect(fillOpacityEncoder).toHaveBeenCalledTimes(4);
        expect(second.context.lineWidth).toBe(3);
    });

    test("draws independently rounded and clamped rectangle corners", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: 2,
                cornerRadiusTopLeft: 50,
                cornerRadiusTopRight: 4,
                cornerRadiusBottomRight: 6,
                cornerRadiusBottomLeft: 8,
                stroke: "#654321",
                strokeWidth: 2,
                fillOpacity: 0.25,
                strokeOpacity: 0.75,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.6 },
                y: { value: 0.2 },
                y2: { value: 0.4 },
                fill: { value: "#123456" },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.calls.roundRects).toEqual([
            [20, 60, 40, 20, [10, 4, 6, 8]],
        ]);
        expect(recording.context.fill).toHaveBeenCalledOnce();
        expect(recording.context.stroke).toHaveBeenCalledOnce();
        expect(recording.calls.fills).toEqual([[0.25, "#123456"]]);
        expect(recording.calls.strokes).toEqual([[0.75, "#654321"]]);
        expect(recording.calls.fillRects).toHaveLength(0);
        expect(recording.context.strokeRect).not.toHaveBeenCalled();
    });

    test("clamps negative rectangle corner radii to zero", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: -5,
                cornerRadiusTopRight: 4,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.6 },
                y: { value: 0.2 },
                y2: { value: 0.4 },
                fill: { value: "black" },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.calls.roundRects).toEqual([
            [20, 60, 40, 20, [0, 4, 0, 0]],
        ]);
        expect(recording.context.fill).toHaveBeenCalledOnce();
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

    test("uses the configured native font with portable fallbacks", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.25, label: "A" },
                    { x: 0.75, label: "B" },
                ],
            },
            mark: {
                type: "text",
                font: "Open Sans",
                fontStyle: "italic",
                fontWeight: "bold",
            },
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
                size: { value: 12 },
            },
        });
        const recording = createRecordingContext();

        render(view, recording.context);

        expect(recording.context.font).toBe(
            "italic 700 12px 'Open Sans', 'Lato', 'Avenir Next', 'Avenir', 'Segoe UI', 'Ubuntu', 'Noto Sans', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
        );
        expect(recording.calls.fonts).toEqual([recording.context.font]);
        expect(recording.calls.fillTexts).toHaveLength(2);
    });

    test("evaluates constant text encoders once per render", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.25, label: "A", angle: 0 },
                    { x: 0.75, label: "B", angle: 30 },
                ],
            },
            mark: "text",
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });
        const encoders =
            /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
                /** @type {import("../../view/unitView.js").default} */ (view)
                    .mark.encoders
            );
        let size = 12;
        const sizeEncoder = Object.assign(
            vi.fn(() => size),
            encoders.size
        );
        const angleEncoder = Object.assign(
            vi.fn((datum) => datum.angle),
            encoders.angle,
            { constant: false }
        );
        encoders.size = sizeEncoder;
        encoders.angle = angleEncoder;

        const first = createRecordingContext();
        render(view, first.context);

        expect(sizeEncoder).toHaveBeenCalledOnce();
        expect(angleEncoder).toHaveBeenCalledTimes(2);
        expect(first.calls.fonts[0]).toContain("12px");

        size = 18;
        const second = createRecordingContext();
        render(view, second.context);

        expect(sizeEncoder).toHaveBeenCalledTimes(2);
        expect(angleEncoder).toHaveBeenCalledTimes(4);
        expect(second.calls.fonts[0]).toContain("18px");
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
        expect(recording.calls.fillTexts).toEqual([["A", 0, 0.35, undefined]]);
        expect(recording.context.textBaseline).toBe("alphabetic");
    });
});

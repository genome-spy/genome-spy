// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../../view/layout/rectangle.js";
import { createSvg } from "../index.js";
import { createEmbedParamNamespace } from "../../../paramRuntime/embedParamApi.js";
import SvgViewRenderingContext from "../svgViewRenderingContext.js";

describe("SVG text renderer", () => {
    test.each(/** @type {const} */ (["color", "fill"]))(
        "preserves shared %s scales, legends and category focus",
        async (channel) => {
            const paint = {
                field: "state",
                type: /** @type {const} */ ("nominal"),
                scale: { domain: ["A", "B"], range: ["red", "blue"] },
            };
            const { view } = await createHeadlessEngine({
                data: {
                    values: [
                        { state: "A", x: 0.25 },
                        { state: "B", x: 0.75 },
                    ],
                },
                params: [
                    {
                        name: "focus",
                        select: { type: "point", encodings: [channel] },
                    },
                ],
                resolve: {
                    scale: { [channel]: "shared" },
                    legend: { [channel]: "shared" },
                },
                layer: [
                    {
                        name: "labels",
                        mark: "text",
                        encoding: {
                            x: { field: "x", type: "quantitative", axis: null },
                            y: { value: 0.5 },
                            text: { field: "state" },
                            [channel]: paint,
                            opacity: {
                                condition: {
                                    test: { param: "focus", empty: false },
                                    value: 1,
                                },
                                value: 0.2,
                            },
                        },
                    },
                    {
                        name: "points",
                        mark: "point",
                        encoding: { [channel]: paint },
                    },
                ],
            });
            try {
                const labels = view
                    .getDescendants()
                    .find((child) => child.name === "labels");
                const points = view
                    .getDescendants()
                    .find((child) => child.name === "points");
                expect(labels.getScaleResolution(channel)).toBe(
                    points.getScaleResolution(channel)
                );
                expect(labels.getScaleResolution(channel).getDomain()).toEqual([
                    "A",
                    "B",
                ]);
                expect(labels.getLegendResolution(channel)).toBeDefined();
                expect(labels.getLegendResolution(channel)).toBe(
                    points.getLegendResolution(channel)
                );
                const focus =
                    createEmbedParamNamespace(labels).getSelection("focus");
                if (focus.type !== "point")
                    throw new Error("Expected category selection");
                focus.setValue([["A"]]);
                const { svg } = createSvg({
                    viewRoot: view,
                    logicalWidth: 200,
                    logicalHeight: 100,
                });
                const texts = svg.querySelector(
                    '[data-name="labels"] [data-mark-type="text"]'
                ).children;
                expect(
                    Array.from(texts, (text) => [
                        text.getAttribute("fill"),
                        text.getAttribute("fill-opacity"),
                    ])
                ).toEqual([
                    ["red", "1"],
                    ["blue", "0.2"],
                ]);
            } finally {
                view.disposeSubtree();
            }
        }
    );

    test("explicit reactive fill overrides color without an unused color scale", async () => {
        const { view } = await createHeadlessEngine({
            params: [
                { name: "paint", value: "red" },
                { name: "alpha", value: 0.4 },
            ],
            data: { values: [{ label: "A", unused: "category" }] },
            mark: {
                type: "text",
                fill: { expr: "paint" },
                fillOpacity: { expr: "alpha" },
                opacity: 0.5,
            },
            encoding: {
                text: { field: "label" },
                color: { field: "unused", type: "nominal" },
            },
        });
        try {
            expect(view.getScaleResolution("color")).toBeUndefined();
            const group = () =>
                createSvg({
                    viewRoot: view,
                    logicalWidth: 100,
                    logicalHeight: 50,
                }).svg.querySelector('[data-mark-type="text"]');
            expect(group().getAttribute("fill")).toBe("red");
            expect(group().getAttribute("fill-opacity")).toBe("0.2");
            view.paramRuntime.setValue("alpha", 1);
            await view.paramRuntime.whenPropagated();
            expect(group().getAttribute("fill-opacity")).toBe("0.5");
            view.paramRuntime.setValue("paint", "green");
            await view.paramRuntime.whenPropagated();
            expect(group().getAttribute("fill")).toBe("green");
            view.paramRuntime.setValue("paint", null);
            await view.paramRuntime.whenPropagated();
            expect(group().getAttribute("fill")).toBe("none");
        } finally {
            view.disposeSubtree();
        }
    });

    test("keeps conditional fill opacity independent of scalar opacity and its scale", async () => {
        const { view } = await createHeadlessEngine({
            params: [
                { name: "picked", select: "point" },
                { name: "selectedAlpha", value: 1 },
            ],
            data: {
                values: [
                    { label: "A", alpha: 0 },
                    { label: "B", alpha: 0.5 },
                ],
            },
            mark: { type: "text", fill: "black", opacity: 0.5 },
            encoding: {
                key: { field: "label" },
                text: { field: "label" },
                fillOpacity: {
                    condition: {
                        test: { param: "picked", empty: false },
                        value: { expr: "selectedAlpha" },
                    },
                    field: "alpha",
                    type: "quantitative",
                    scale: { domain: [0, 1], range: [0, 1] },
                },
            },
        });
        try {
            expect(view.getScaleResolution("fillOpacity")).toBeDefined();
            expect(view.getScaleResolution("opacity")).toBeUndefined();
            const alphas = () =>
                Array.from(
                    createSvg({
                        viewRoot: view,
                        logicalWidth: 100,
                        logicalHeight: 50,
                    }).svg.querySelectorAll('[data-mark-type="text"] text'),
                    (text) => text.getAttribute("fill-opacity")
                );
            expect(alphas()).toEqual(["0", "0.25"]);
            const picked =
                createEmbedParamNamespace(view).getSelection("picked");
            if (picked.type !== "point")
                throw new Error("Expected record selection");
            picked.setValue([["A"]]);
            await view.paramRuntime.whenPropagated();
            expect(alphas()).toEqual(["0.5", "0.25"]);
            view.paramRuntime.setValue("selectedAlpha", 0.4);
            await view.paramRuntime.whenPropagated();
            expect(alphas()).toEqual(["0.2", "0.25"]);
        } finally {
            view.disposeSubtree();
        }
    });

    test("keeps conditional legacy color paint after normalization", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "picked", select: "point" }],
            data: { values: [{ id: "A" }, { id: "B" }] },
            mark: "text",
            encoding: {
                key: { field: "id" },
                text: { field: "id" },
                color: {
                    condition: { param: "picked", empty: false, value: "red" },
                    value: "blue",
                },
            },
        });
        try {
            const picked =
                createEmbedParamNamespace(view).getSelection("picked");
            if (picked.type !== "point")
                throw new Error("Expected record selection");
            picked.setValue([["A"]]);
            const { svg } = createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 50,
            });
            expect(
                Array.from(
                    svg.querySelector('[data-mark-type="text"]').children,
                    (text) => text.getAttribute("fill")
                )
            ).toEqual(["red", "blue"]);
        } finally {
            view.disposeSubtree();
        }
    });

    test("positions and squeezes text inside an encoded range", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ label: "A fitted label" }] },
            mark: {
                type: "text",
                size: 20,
                paddingX: 2,
                squeeze: true,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.4 },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const text = svg.querySelector('[data-mark-type="text"] text');
        const textGroup = svg.querySelector('[data-mark-type="text"]');

        expect(text?.getAttribute("x")).toBe("0");
        expect(text?.hasAttribute("font-size")).toBe(false);
        expect(text?.hasAttribute("textLength")).toBe(false);
        expect(text?.getAttribute("transform")).toMatch(
            /^translate\(60 50\) scale\(0\.\d+\)$/
        );
        expect(textGroup?.getAttribute("font-family")).toBe(
            "'Lato', 'Avenir Next', 'Avenir', 'Segoe UI', 'Ubuntu', 'Noto Sans', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
        );
        expect(warnings).toEqual([]);
    });

    test("prefers the configured font before portable fallbacks", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ label: "Text" }] },
            mark: { type: "text", font: "Open Sans" },
            encoding: {
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 50,
            background: null,
        });

        expect(
            svg
                .querySelector('[data-mark-type="text"]')
                ?.getAttribute("font-family")
        ).toBe(
            "'Open Sans', 'Lato', 'Avenir Next', 'Avenir', 'Segoe UI', 'Ubuntu', 'Noto Sans', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
        );
    });

    test("fits text to discrete scale bands", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { category: "A", label: "Alpha" },
                    { category: "B", label: "Beta" },
                ],
            },
            mark: { type: "text", fitToBand: true, size: 12 },
            encoding: {
                x: { field: "category", type: "nominal" },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const labels = Array.from(
            svg.querySelectorAll('[data-mark-type="text"] text')
        );

        expect(labels).toHaveLength(2);
        expect(labels.map((label) => label.getAttribute("x"))).toEqual([
            "0",
            "0",
        ]);
        expect(labels.map((label) => label.getAttribute("transform"))).toEqual([
            "translate(50 50)",
            "translate(150 50)",
        ]);
        expect(warnings).toEqual([]);
    });

    test("stretches sequence-logo letters into encoded rectangles", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ base: "A" }] },
            mark: {
                type: "text",
                logoLetters: true,
                size: 100,
                dx: 2,
                dy: -3,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.4 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                text: { field: "base" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const text = svg.querySelector('[data-mark-type="text"] text');

        expect(text?.textContent).toBe("A");
        expect(text?.getAttribute("font-size")).toBe("100");
        expect(text?.getAttribute("text-anchor")).toBe("start");
        expect(text?.hasAttribute("dy")).toBe(false);
        expect(text?.hasAttribute("textLength")).toBe(false);
        expect(text?.getAttribute("transform")).toBe(
            "translate(60 50) translate(2 -3) scale(0.6 0.7) translate(-34.3 45.4)"
        );
        expect(warnings).toEqual([]);
    });

    test("uses portable numeric baseline offsets", async () => {
        const baselines = ["top", "middle", "baseline", "bottom"];
        const { view } = await createHeadlessEngine({
            data: { values: [{ label: "Text" }] },
            layer: baselines.map((baseline) => ({
                mark: {
                    type: "text",
                    baseline:
                        /** @type {"top" | "middle" | "baseline" | "bottom"} */ (
                            baseline
                        ),
                    size: 20,
                },
                encoding: {
                    x: { value: 0.5 },
                    y: { value: 0.5 },
                    text: { field: "label" },
                    color: { value: "black" },
                },
            })),
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const texts = Array.from(
            svg.querySelectorAll('[data-mark-type="text"] text')
        );

        expect(texts.map((text) => text.getAttribute("dy"))).toEqual([
            "15.8",
            "7",
            "0",
            "-4.2",
        ]);
        expect(svg.querySelector("[dominant-baseline]")).toBeNull();
        expect(warnings).toEqual([]);
    });

    test("uses fit-to-band bounds for sequence-logo letters", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { category: "A", base: "A" },
                    { category: "B", base: "C" },
                ],
            },
            mark: {
                type: "text",
                logoLetters: true,
                fitToBand: true,
                size: 100,
            },
            encoding: {
                x: { field: "category", type: "nominal" },
                y: { value: 0.25 },
                y2: { value: 0.75 },
                text: { field: "base" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });

        expect(
            Array.from(
                svg.querySelectorAll('[data-mark-type="text"] text'),
                (text) => text.getAttribute("transform")
            )
        ).toEqual([
            "translate(50 50) scale(1.5 0.6) translate(-34.3 45.4)",
            "translate(150 50) scale(1.5 0.6) translate(-33.8 45.4)",
        ]);
        expect(warnings).toEqual([]);
    });

    test("preserves the direction of reversed logo-letter ranges", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ base: "T" }] },
            mark: { type: "text", logoLetters: true, size: 100 },
            encoding: {
                x: { value: 0.8 },
                x2: { value: 0.2 },
                y: { value: 0.8 },
                y2: { value: 0.2 },
                text: { field: "base" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const text = svg.querySelector('[data-mark-type="text"] text');

        expect(text?.getAttribute("transform")).toBe(
            "translate(100 50) scale(-2 -0.7) translate(-29.9 45.4)"
        );
        expect(warnings).toEqual([]);
    });

    test("projects sequence-logo ranges into SampleView facets", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ base: "G" }] },
            mark: { type: "text", logoLetters: true, size: 100 },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.4 },
                y: { value: 0.25 },
                y2: { value: 0.75 },
                text: { field: "base" },
                color: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 200, height: 100 }
        );

        view.arrange(context, Rectangle.create(0, 0, 200, 100), {
            sampleFacetRenderingOptions: {
                locSize: { location: 20, size: 40 },
                pixelToUnit: 0.01,
            },
        });

        const text = context
            .getSvg()
            .querySelector('[data-mark-type="text"] text');
        expect(text?.getAttribute("transform")).toBe(
            "translate(60 40) scale(0.5 0.2) translate(-37 45.4)"
        );
    });

    test("anchor-culls unclipped text in the configured direction", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.5, y: 0.9, label: "Above" },
                    { x: 0.1, y: 0.5, label: "Inside" },
                    { x: 0.5, y: 0.1, label: "Below" },
                ],
            },
            mark: {
                type: "text",
                clip: "never",
                cullByVisibleRange: "y",
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { field: "y", type: "quantitative", scale: null },
                text: { field: "label" },
                color: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );

        view.arrange(context, Rectangle.create(0, 0, 100, 100), {
            clip: {
                rect: Rectangle.create(25, 25, 50, 50),
                clipX: true,
                clipY: true,
            },
        });

        const svg = context.getSvg();
        expect(
            Array.from(
                svg.querySelectorAll('[data-mark-type="text"] text'),
                (text) => text.textContent
            )
        ).toEqual(["Inside"]);
        expect(
            svg
                .querySelector('[data-mark-type="text"]')
                ?.hasAttribute("clip-path")
        ).toBe(false);
    });

    test("anchor-culls text after SampleView facet projection", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ label: "Sample" }] },
            mark: {
                type: "text",
                clip: "never",
                cullByVisibleRange: "y",
            },
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });
        const context = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100 }
        );
        const coords = Rectangle.create(0, 0, 100, 100);
        const clip = {
            rect: Rectangle.create(0, 25, 100, 50),
            clipX: false,
            clipY: true,
        };

        view.arrange(context, coords, {
            clip,
            sampleFacetRenderingOptions: {
                locSize: { location: 0, size: 20 },
                pixelToUnit: 0.01,
            },
        });
        view.arrange(context, coords, {
            clip,
            sampleFacetRenderingOptions: {
                locSize: { location: 40, size: 20 },
                pixelToUnit: 0.01,
            },
        });

        expect(
            context.getSvg().querySelectorAll('[data-mark-type="text"] text')
        ).toHaveLength(1);
        const text = context
            .getSvg()
            .querySelector('[data-mark-type="text"] text');
        expect(text?.getAttribute("y")).toBe("0");
        expect(text?.getAttribute("transform")).toBe("translate(50 50)");
    });

    test("reuses one viewport-edge fade mask for all text in a view", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { x: 0.1, label: "Left" },
                    { x: 0.9, label: "Right" },
                ],
            },
            mark: {
                type: "text",
                viewportEdgeFadeWidthLeft: 20,
                viewportEdgeFadeDistanceLeft: -5,
                viewportEdgeFadeWidthRight: 20,
                viewportEdgeFadeDistanceRight: -10,
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 50,
            background: null,
        });
        const textGroup = svg.querySelector('[data-mark-type="text"]');
        const mask = svg.querySelector("mask");
        const gradients = Array.from(svg.querySelectorAll("linearGradient"));

        expect(
            svg.querySelectorAll('[data-mark-type="text"] text')
        ).toHaveLength(2);
        expect(svg.querySelectorAll("mask")).toHaveLength(1);
        expect(textGroup?.getAttribute("mask")).toBe(
            `url(#${mask?.getAttribute("id")})`
        );
        expect(gradients).toHaveLength(2);
        expect(
            gradients.map((gradient) => [
                gradient.getAttribute("x1"),
                gradient.getAttribute("x2"),
            ])
        ).toEqual([
            ["110", "90"],
            ["-5", "15"],
        ]);
        expect(warnings).toEqual([]);
    });

    test("resolves the current expression-backed edge fade", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "fadeDistance", value: -5 }],
            data: { values: [{ label: "Label" }] },
            mark: {
                type: "text",
                viewportEdgeFadeWidthLeft: 20,
                viewportEdgeFadeDistanceLeft: { expr: "fadeDistance" },
            },
            encoding: {
                x: { value: 0.5 },
                y: { value: 0.5 },
                text: { field: "label" },
                color: { value: "black" },
            },
        });

        const renderGradient = () =>
            createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 50,
                background: null,
            }).svg.querySelector("linearGradient");

        expect(renderGradient()?.getAttribute("x1")).toBe("-5");
        view.paramRuntime.setValue("fadeDistance", 10);
        expect(renderGradient()?.getAttribute("x1")).toBe("10");
    });
});

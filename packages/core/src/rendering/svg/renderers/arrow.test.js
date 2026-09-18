// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

describe("SVG arrow renderer", () => {
    test("exports basic forward and reverse arrows as paths", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { y: 0.3, direction: "forward", color: "#5b8def" },
                    { y: 0.7, direction: "reverse", color: "#ef5b8d" },
                ],
            },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 2,
                stroke: "black",
                strokeWidth: 1,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { field: "y", type: "quantitative", scale: null },
                direction: {
                    field: "direction",
                    type: "nominal",
                    scale: null,
                },
                fill: { field: "color", type: "nominal", scale: null },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const arrows = Array.from(
            svg.querySelectorAll('[data-mark-type="arrow"] path')
        );

        expect(arrows).toHaveLength(2);
        expect(arrows.map((arrow) => arrow.getAttribute("fill"))).toEqual([
            "#5b8def",
            "#ef5b8d",
        ]);
        expect(svg.querySelector('[data-mark-type="arrow"] > g')).toBeNull();
        expect(arrows[0].getAttribute("d")).toContain("80 70");
        expect(arrows[1].getAttribute("d")).toContain("20 30");
        expect(warnings).toEqual([]);
    });

    test("exports an open arrowhead without a stem", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                headShape: "open",
                stem: false,
                size: 4,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(
            svg.querySelectorAll('[data-mark-type="arrow"] path')
        ).toHaveLength(1);
        expect(warnings).toEqual([]);
    });

    test("exports bidirectional heads and ignores one-way decorations", async () => {
        /** @param {boolean} decorated */
        const createView = async (decorated) =>
            (
                await createHeadlessEngine({
                    data: { values: [{}] },
                    mark: {
                        type: "arrow",
                        direction: /** @type {any} */ (
                            decorated ? "both" : { expr: "'both'" }
                        ),
                        size: 10,
                        headWidth: 2,
                        startNotch: decorated,
                        headSpacing: decorated ? 2 : null,
                        fill: "black",
                        stroke: null,
                    },
                    encoding: {
                        x: { value: 0.2 },
                        x2: { value: 0.8 },
                        y: { value: 0.5 },
                    },
                })
            ).view;
        const undecorated = createSvg({
            viewRoot: await createView(false),
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        }).svg;
        const decorated = createSvg({
            viewRoot: await createView(true),
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        }).svg;
        const pathData =
            decorated
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d") ?? "";

        expect(pathData).toContain("20 50");
        expect(pathData).toContain("80 50");
        expect(pathData.match(/\bM /g)).toHaveLength(3);
        expect(pathData).toBe(
            undecorated
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d")
        );
    });

    test("exports outside and stemless bidirectional heads", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                direction: /** @type {any} */ ("both"),
                headShape: "open",
                headPlacement: "outside",
                stem: false,
                size: 10,
                headWidth: 2,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
            },
        });
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const pathData =
            svg
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d") ?? "";

        expect(pathData).toContain("5.9 50");
        expect(pathData).toContain("94.1 50");
        expect(pathData.match(/\bM /g)).toHaveLength(2);
        expect(warnings).toEqual([]);
    });

    test("keeps degenerate bidirectional geometry finite", async () => {
        const { view: zeroHeadView } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                direction: /** @type {any} */ ("both"),
                headShape: "open",
                headWidth: 0,
                stem: false,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
            },
        });
        const zeroHeadSvg = createSvg({
            viewRoot: zeroHeadView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        }).svg;
        const pathData =
            zeroHeadSvg
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d") ?? "";

        expect(pathData).not.toMatch(/NaN|Infinity/);

        const { view: shortView } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                direction: /** @type {any} */ ("both"),
                size: 10,
                headWidth: 3,
                minStemLength: 20,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.45 },
                x2: { value: 0.55 },
                y: { value: 0.5 },
            },
        });
        const shortSvg = createSvg({
            viewRoot: shortView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        }).svg;
        const shortPathData =
            shortSvg
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d") ?? "";

        expect(shortPathData).not.toMatch(/NaN|Infinity/);

        const { view: zeroLengthView } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                direction: /** @type {any} */ ("both"),
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.5 },
                x2: { value: 0.5 },
                y: { value: 0.5 },
            },
        });
        const zeroLengthSvg = createSvg({
            viewRoot: zeroLengthView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        }).svg;

        expect(
            zeroLengthSvg.querySelector('[data-mark-type="arrow"] path')
        ).toBeNull();
    });

    test("shortens both inside heads symmetrically", async () => {
        /** @param {boolean} diagonal @param {boolean} [stem] */
        const createPath = async (diagonal, stem = true) => {
            const { view } = await createHeadlessEngine({
                data: { values: [{}] },
                mark: {
                    type: "arrow",
                    direction: /** @type {any} */ ("both"),
                    size: 10,
                    headWidth: 3,
                    minStemLength: diagonal ? 10 : 20,
                    stem,
                    fill: "black",
                    stroke: null,
                },
                encoding: diagonal
                    ? {
                          x: { value: 0.4 },
                          x2: { value: 0.6 },
                          y: { value: 0.4 },
                          y2: { value: 0.6 },
                      }
                    : {
                          x: { value: stem ? 0.3 : 0.45 },
                          x2: { value: stem ? 0.7 : 0.55 },
                          y: { value: 0.5 },
                      },
            });
            const svg = createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 100,
                background: null,
            }).svg;
            return (
                svg
                    .querySelector('[data-mark-type="arrow"] path')
                    ?.getAttribute("d") ?? ""
            );
        };
        const horizontalPath = await createPath(false);
        const diagonalPath = await createPath(true);
        const stemlessPath = await createPath(false, false);

        expect(horizontalPath).toContain("M 30 50");
        expect(horizontalPath).toContain("L 40 50");
        expect(horizontalPath).toContain("M 70 50");
        expect(horizontalPath).toContain("L 60 50");
        expect(diagonalPath).toContain("L 46.5 53.5");
        expect(diagonalPath).toContain("L 53.5 46.5");
        expect(stemlessPath).toContain("L 60 35");
        expect(stemlessPath).toContain("L 40 65");
    });

    test.each(["triangle", "open"])(
        "unions stroked bidirectional %s heads with the stem",
        async (headShape) => {
            const { view } = await createHeadlessEngine({
                data: { values: [{}] },
                mark: {
                    type: "arrow",
                    direction: /** @type {any} */ ("both"),
                    headShape: /** @type {"triangle" | "open"} */ (headShape),
                    size: 6,
                    headWidth: 3,
                    fill: "#5b8def",
                    stroke: "black",
                    strokeWidth: 1,
                },
                encoding: {
                    x: { value: 0.2 },
                    x2: { value: 0.8 },
                    y: { value: 0.5 },
                },
            });
            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 100,
                background: null,
            });
            const pathData =
                svg
                    .querySelector('[data-mark-type="arrow"] path')
                    ?.getAttribute("d") ?? "";

            expect(pathData.match(/\bM /g)).toHaveLength(1);
            expect(pathData).toContain("20 50");
            expect(pathData).toContain("80 50");
            expect(pathData).not.toMatch(/NaN|Infinity/);
            expect(warnings).toEqual([]);
        }
    );

    test.each([
        [-0.2, -0.05, "2.1 97.9"],
        [1.05, 1.2, "97.9 2.1"],
    ])(
        "keeps a diagonal bidirectional outside head visible at the viewport boundary",
        async (start, end, expectedPoint) => {
            const { view } = await createHeadlessEngine({
                data: { values: [{}] },
                mark: {
                    type: "arrow",
                    direction: /** @type {any} */ ("both"),
                    headPlacement: "outside",
                    size: 10,
                    headWidth: 2,
                    fill: "black",
                    stroke: null,
                },
                encoding: {
                    x: { value: start },
                    x2: { value: end },
                    y: { value: start },
                    y2: { value: end },
                },
            });
            const svg = createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 100,
                background: null,
            }).svg;
            const pathData =
                svg
                    .querySelector('[data-mark-type="arrow"] path')
                    ?.getAttribute("d") ?? "";

            expect(pathData).toContain(expectedPoint);
        }
    );

    test("keeps one-way decorations scoped to one-way data", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { y: 0.2, direction: "forward" },
                    { y: 0.5, direction: "reverse" },
                    { y: 0.8, direction: "both" },
                ],
            },
            mark: {
                type: "arrow",
                headSpacing: 2,
                startNotch: true,
                size: 4,
                headWidth: 3,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { field: "y", type: "quantitative", scale: null },
                direction: {
                    field: "direction",
                    type: "nominal",
                    scale: null,
                },
            },
        });
        const svg = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        }).svg;
        const paths = Array.from(
            svg.querySelectorAll('[data-mark-type="arrow"] path')
        ).map((path) => path.getAttribute("d") ?? "");

        expect(paths).toHaveLength(3);
        expect(paths[0].match(/\bM /g)?.length).toBeGreaterThan(3);
        expect(paths[1].match(/\bM /g)?.length).toBeGreaterThan(3);
        expect(paths[2].match(/\bM /g)).toHaveLength(3);
    });

    test("rejects invalid scale-less direction values", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ direction: "sideways" }] },
            mark: { type: "arrow", fill: "black", stroke: null },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
                direction: {
                    field: "direction",
                    type: "nominal",
                    scale: null,
                },
            },
        });

        expect(() =>
            createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 100,
                background: null,
            })
        ).toThrow('Invalid value for "direction" channel: sideways');
    });

    test("maps an explicit direction range to both", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ kind: "bidirectional" }] },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 2,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
                direction: {
                    field: "kind",
                    type: "nominal",
                    scale: {
                        domain: ["bidirectional"],
                        range: ["both"],
                    },
                },
            },
        });
        const svg = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        }).svg;
        const pathData =
            svg
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d") ?? "";

        expect(pathData).toContain("20 50");
        expect(pathData).toContain("80 50");
    });

    test("exports diagonal arrow geometry", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 0.2, y: 0.2, x2: 0.8, y2: 0.8 }] },
            mark: {
                type: "arrow",
                size: 8,
                fill: "#5b8def",
                stroke: "black",
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                x2: { field: "x2" },
                y: { field: "y", type: "quantitative", scale: null },
                y2: { field: "y2" },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const body = svg.querySelector('[data-mark-type="arrow"] path');

        expect(body?.getAttribute("d")).toContain("80 20");
    });

    test("exports arrow start and head notches", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ y: 0.35 }, { y: 0.65 }] },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 3,
                headAngle: 45,
                headNotchAngle: 60,
                startNotch: true,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { field: "y", type: "quantitative", scale: null },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const bodies = Array.from(
            svg.querySelectorAll('[data-mark-type="arrow"] path')
        );

        // The start notch is five pixels deep for a 45-degree, 10-pixel stem.
        expect(bodies[0].getAttribute("d")).toContain("25 65");
        expect(warnings).toEqual([]);
    });

    test("exports notched standalone heads and short-arrow blunting", async () => {
        const { view: notchedView } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                stem: false,
                size: 10,
                headWidth: 3,
                headAngle: 45,
                headNotchAngle: 60,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
            },
        });
        const { svg: notchedSvg } = createSvg({
            viewRoot: notchedView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(
            notchedSvg
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d")
        ).toContain("73.7 50");

        const { view: shortView } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 3,
                headAngle: 45,
                minStemLength: 15,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.4 },
                x2: { value: 0.6 },
                y: { value: 0.5 },
            },
        });
        const { svg: shortSvg, warnings } = createSvg({
            viewRoot: shortView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        // The configured 15-pixel head is blunted to preserve 15 pixels of stem.
        expect(
            shortSvg
                .querySelector('[data-mark-type="arrow"] path')
                ?.getAttribute("d")
        ).toContain("55 65");
        expect(warnings).toEqual([]);
    });

    test("preserves minimum stem length in block-notch arrows", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                style: "arrow-block-notch",
                size: 10,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.4 },
                x2: { value: 0.58 },
                y: { value: 0.5 },
            },
        });
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const body = svg.querySelector('[data-mark-type="arrow"] path');

        // The start notch is shortened to leave the configured 15-pixel stem.
        expect(body?.getAttribute("d")).toContain("43 50");
        expect(warnings).toEqual([]);
    });

    test.each(["triangle", "open"])(
        "merges repeated %s heads and the stem into one path",
        async (headShape) => {
            const { view } = await createHeadlessEngine({
                data: { values: [{}] },
                mark: {
                    type: "arrow",
                    headShape: /** @type {"triangle" | "open"} */ (headShape),
                    headSpacing: 3,
                    size: 4,
                    fill: "#5b8def",
                    stroke: "black",
                    strokeWidth: 1,
                },
                encoding: {
                    x: { value: 0.2 },
                    x2: { value: 0.8 },
                    y: { value: 0.5 },
                },
            });

            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 100,
                background: null,
            });
            const path = svg.querySelector('[data-mark-type="arrow"] > path');
            const pathData = path?.getAttribute("d") ?? "";

            expect(
                svg.querySelectorAll('[data-mark-type="arrow"] > path')
            ).toHaveLength(1);
            expect(pathData.match(/\bM /g)).toHaveLength(1);
            expect(pathData).toContain("80 50");
            expect(pathData).toContain("62 56");
            expect(warnings).toEqual([]);
        }
    );

    test("skips polygon union for fill-only repeated heads", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "arrow",
                headSpacing: 3,
                size: 4,
                fill: "black",
                stroke: null,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const pathData =
            svg
                .querySelector('[data-mark-type="arrow"] > path')
                ?.getAttribute("d") ?? "";

        expect(pathData.match(/\bM /g)?.length).toBeGreaterThan(1);
    });
});

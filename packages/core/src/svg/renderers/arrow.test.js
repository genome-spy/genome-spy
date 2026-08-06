// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

describe("SVG arrow renderer", () => {
    test("exports basic forward and reverse arrows as paths", async () => {
        const { view } = await createHeadlessEngine({
            data: {
                values: [
                    { y: 0.3, direction: "forward" },
                    { y: 0.7, direction: "reverse" },
                ],
            },
            mark: {
                type: "arrow",
                size: 10,
                headWidth: 2,
                fill: "#5b8def",
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
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const arrows = Array.from(
            svg.querySelectorAll(
                '[data-mark-type="arrow"] [data-arrow-part="body"]'
            )
        );

        expect(arrows).toHaveLength(2);
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
            svg.querySelectorAll('[data-mark-type="arrow"] [data-arrow-part]')
        ).toHaveLength(1);
        expect(svg.querySelector('[data-arrow-part="head"]')).not.toBeNull();
        expect(warnings).toEqual([]);
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
        const body = svg.querySelector('[data-arrow-part="body"]');

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
            svg.querySelectorAll('[data-arrow-part="body"]')
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
                .querySelector('[data-arrow-part="body"]')
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
                .querySelector('[data-arrow-part="body"]')
                ?.getAttribute("d")
        ).toContain("55 65");
        expect(warnings).toEqual([]);
    });
});

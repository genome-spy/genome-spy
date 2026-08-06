// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

describe("SVG rectangle renderer", () => {
    test("exports expression-valued uniform rectangle radii", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "radius", value: 12 }],
            data: { values: [{}] },
            mark: { type: "rect", cornerRadius: { expr: "radius" } },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "#123456" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const rect = svg.querySelector('[data-mark-type="rect"] rect');

        expect(rect?.getAttribute("rx")).toBe("12");
        expect(rect?.getAttribute("ry")).toBe("12");
        expect(warnings).toEqual([]);
    });

    test("exports independently rounded and clamped rectangle corners", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: 2,
                cornerRadiusTopLeft: 50,
                cornerRadiusTopRight: 4,
                cornerRadiusBottomRight: 6,
                cornerRadiusBottomLeft: 8,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.6 },
                y: { value: 0.2 },
                y2: { value: 0.4 },
                fill: { value: "#123456" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const path = svg.querySelector('[data-mark-type="rect"] path');

        expect(path?.getAttribute("d")).toBe(
            "M 30 60 H 56 A 4 4 0 0 1 60 64 V 74 " +
                "A 6 6 0 0 1 54 80 H 28 A 8 8 0 0 1 20 72 V 70 " +
                "A 10 10 0 0 1 30 60 Z"
        );
        expect(warnings).toEqual([]);
    });

    test("preserves minimum rectangle size and opacity compensation", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                minWidth: 5,
                minHeight: 4,
                minOpacity: 0.5,
            },
            encoding: {
                x: { value: 0.5 },
                x2: { value: 0.51 },
                y: { value: 0.5 },
                y2: { value: 0.52 },
                fill: { value: "#123456" },
            },
        });

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });
        const rect = svg.querySelector('[data-mark-type="rect"] rect');

        expect(rect?.getAttribute("x")).toBe("48");
        expect(rect?.getAttribute("y")).toBe("47");
        expect(rect?.getAttribute("width")).toBe("5");
        expect(rect?.getAttribute("height")).toBe("4");
        expect(rect?.getAttribute("opacity")).toBe("0.5");
    });

    test("warns about rectangle effects without preventing export", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "rect",
                cornerRadius: 5,
                hatch: "diagonal",
                shadowOpacity: 0.5,
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.2 },
                y2: { value: 0.8 },
                fill: { value: "#123456" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(
            svg
                .querySelector('[data-mark-type="rect"] rect')
                ?.getAttribute("rx")
        ).toBe("5");
        expect(warnings).toHaveLength(2);
        expect(warnings.join(" ")).toContain("rectangle hatch");
        expect(warnings.join(" ")).toContain("rectangle shadow");
    });
});

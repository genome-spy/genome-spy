// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

describe("SVG text renderer", () => {
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

        expect(text?.getAttribute("x")).toBe("60");
        expect(+text?.getAttribute("font-size")).toBeLessThan(20);
        expect(+text?.getAttribute("textLength")).toBeLessThanOrEqual(40);
        expect(warnings).toEqual([]);
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
            "50",
            "150",
        ]);
        expect(warnings).toEqual([]);
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
});

// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import Rectangle from "../../view/layout/rectangle.js";
import { createSvg } from "./index.js";
import SvgViewRenderingContext from "./svgViewRenderingContext.js";

describe("SVG instance culling", () => {
    test.each([
        [
            "point",
            {
                data: { values: [{ x: 0.5 }, { x: 2 }] },
                mark: { type: "point", size: 100 },
                encoding: {
                    x: { field: "x", type: "quantitative", scale: null },
                    y: { value: 0.5 },
                    fill: { value: "black" },
                },
            },
            '[data-mark-type="point"] > *',
        ],
        [
            "rectangle",
            {
                data: {
                    values: [
                        { x: 0.2, x2: 0.4 },
                        { x: 2, x2: 3 },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: { field: "x", type: "quantitative", scale: null },
                    x2: { field: "x2" },
                    y: { value: 0.2 },
                    y2: { value: 0.8 },
                    fill: { value: "black" },
                },
            },
            '[data-mark-type="rect"] > *',
        ],
        [
            "rule",
            {
                data: {
                    values: [
                        { x: 0.2, x2: 0.8 },
                        { x: 2, x2: 3 },
                    ],
                },
                mark: "rule",
                encoding: {
                    x: { field: "x", type: "quantitative", scale: null },
                    x2: { field: "x2" },
                    y: { value: 0.5 },
                    color: { value: "black" },
                },
            },
            '[data-mark-type="rule"] > line',
        ],
        [
            "text",
            {
                data: {
                    values: [
                        { x: 0.5, label: "visible" },
                        { x: 2, label: "outside" },
                    ],
                },
                mark: "text",
                encoding: {
                    x: { field: "x", type: "quantitative", scale: null },
                    y: { value: 0.5 },
                    text: { field: "label" },
                    color: { value: "black" },
                },
            },
            '[data-mark-type="text"] > text',
        ],
        [
            "link",
            {
                data: {
                    values: [
                        { x: 0.2, x2: 0.8 },
                        { x: 2, x2: 3 },
                    ],
                },
                mark: { type: "link", linkShape: "line" },
                encoding: {
                    x: { field: "x", type: "quantitative", scale: null },
                    x2: { field: "x2" },
                    y: { value: 0.5 },
                    y2: { value: 0.5 },
                    color: { value: "black" },
                },
            },
            '[data-mark-type="link"] > path',
        ],
        [
            "arrow",
            {
                data: {
                    values: [
                        { x: 0.2, x2: 0.8 },
                        { x: 2, x2: 3 },
                    ],
                },
                mark: { type: "arrow", size: 8 },
                encoding: {
                    x: { field: "x", type: "quantitative", scale: null },
                    x2: { field: "x2" },
                    y: { value: 0.5 },
                    fill: { value: "black" },
                },
            },
            '[data-mark-type="arrow"] > path',
        ],
    ])("culls off-canvas %s instances", async (_name, spec, selector) => {
        const { view } = await createHeadlessEngine(
            /** @type {import("../../spec/root.js").RootSpec} */ (spec)
        );
        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(svg.querySelectorAll(selector)).toHaveLength(1);

        // Counting must use the same visibility decisions without emitting
        // instance elements during its preliminary traversal.
        const countingContext = new SvgViewRenderingContext(
            { picking: false },
            { width: 100, height: 100, background: null }
        );
        countingContext.beginInstanceCounting();
        view.render(countingContext, Rectangle.create(0, 0, 100, 100));
        countingContext.endInstanceCounting();

        const mark = /** @type {import("../../view/unitView.js").default} */ (
            view
        ).mark;
        expect(countingContext.getVisibleInstanceCount(mark)).toBe(1);
        expect(
            countingContext.getSvg().querySelector("[data-mark-type]")
        ).toBeNull();
    });

    test("retains partially visible instances and omits empty mark groups", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: -0.05 }, { x: 2 }] },
            mark: { type: "point", size: 400 },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                fill: { value: "black" },
            },
        });
        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(
            svg.querySelectorAll('[data-mark-type="point"] circle')
        ).toHaveLength(1);

        const { view: emptyView } = await createHeadlessEngine({
            data: { values: [{ x: 2 }] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                y: { value: 0.5 },
                fill: { value: "black" },
            },
        });
        const { svg: emptySvg } = createSvg({
            viewRoot: emptyView,
            logicalWidth: 100,
            logicalHeight: 100,
            background: null,
        });

        expect(emptySvg.querySelector('[data-mark-type="point"]')).toBeNull();
    });
});

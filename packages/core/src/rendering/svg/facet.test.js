// @vitest-environment jsdom

import { expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import AxisView from "../../view/axisView.js";
import { createSvg } from "./index.js";

const contextOptions = {
    baseConfig: resolveBaseConfig({
        defaultConfig: INTERNAL_DEFAULT_CONFIG,
        builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
    }),
    viewFactoryOptions: { wrapRoot: true },
};

test("exports grouped points and distinct headers above each wrapped facet", async () => {
    const { view } = await createHeadlessEngine(
        {
            data: {
                values: [
                    { group: "A", x: 1 },
                    { group: "B", x: 2 },
                    { group: "B", x: 3 },
                    { group: "C", x: 4 },
                    { group: "D", x: 5 },
                ],
            },
            facet: { field: "group" },
            columns: 2,
            axes: { x: { orient: "top", title: null } },
            spec: {
                name: "points",
                width: 100,
                height: 50,
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            },
        },
        { contextOptions }
    );

    try {
        const axes = view
            .getDescendants()
            .filter((child) => child instanceof AxisView);
        expect(axes.map((axis) => axis.axisProps.orient)).toEqual(["top"]);
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 300,
        });
        const cells = Array.from(svg.querySelectorAll('[data-name="points"]'));
        expect(
            cells.map((cell) => cell.querySelectorAll("circle").length)
        ).toEqual([1, 2, 1, 1]);

        const headers = Array.from(
            svg.querySelectorAll('[data-name="facetHeaderColumn0"] text')
        );
        expect(headers.map((header) => header.textContent)).toEqual([
            "A",
            "B",
            "C",
            "D",
        ]);

        // Later rows need their own header band, rather than overlapping labels.
        const positions = headers.map((header) =>
            header.getAttribute("transform")
        );
        expect(new Set(positions).size).toBe(4);
        expect(warnings).toEqual([]);
    } finally {
        view.disposeSubtree();
    }
});

test.each([0, 2])(
    "facet titles and chrome follow grid paint order with background zindex %s",
    async (zindex) => {
        const { view } = await createHeadlessEngine(
            {
                data: {
                    values: [
                        { group: "A", x: 0.25 },
                        { group: "B", x: 0.75 },
                    ],
                },
                facet: { field: "group" },
                spec: {
                    name: "points",
                    width: 100,
                    height: 60,
                    title: "Panel title",
                    view: {
                        fill: "#f0f4f8",
                        zindex,
                        stroke: "#abcdef",
                        strokeZindex: 10,
                    },
                    mark: { type: "point", clip: true },
                    encoding: {
                        fill: { value: "black" },
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                            axis: { title: null },
                        },
                    },
                },
            },
            { contextOptions }
        );

        try {
            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: 400,
                logicalHeight: 200,
            });
            const points = Array.from(
                svg.querySelectorAll('[data-name="points"]')
            );
            const backgrounds = Array.from(
                svg.querySelectorAll('[data-name="background0"]')
            );
            const strokes = Array.from(
                svg.querySelectorAll('[data-name="backgroundStroke0"]')
            );
            const titles = Array.from(
                svg.querySelectorAll('[data-name="title0"] text')
            );
            expect(points).toHaveLength(2);
            expect(backgrounds).toHaveLength(2);
            expect(strokes).toHaveLength(2);
            expect(titles.map((title) => title.textContent)).toEqual([
                "Panel title",
                "Panel title",
            ]);
            expect(
                new Set(titles.map((title) => title.getAttribute("transform")))
                    .size
            ).toBe(2);

            for (const [index, point] of points.entries()) {
                const background = backgrounds[index];
                const stroke = strokes[index];
                expect(
                    Boolean(
                        background.compareDocumentPosition(point) &
                        Node.DOCUMENT_POSITION_FOLLOWING
                    )
                ).toBe(zindex === 0);
                expect(
                    point.compareDocumentPosition(stroke) &
                        Node.DOCUMENT_POSITION_FOLLOWING
                ).toBeTruthy();
                // Background geometry follows the plot frame, excluding title and guide reservations.
                const clipUrl = point
                    .querySelector('[data-mark-type="point"]')
                    .getAttribute("clip-path");
                const clipRect = svg
                    .querySelector(clipUrl.slice(4, -1))
                    .querySelector("rect");
                const fillRect = background.querySelector("rect");
                // Rect marks add 0.1 px of seam padding around the plot frame.
                for (const attribute of ["x", "y", "width", "height"]) {
                    expect(
                        Number(fillRect.getAttribute(attribute))
                    ).toBeCloseTo(Number(clipRect.getAttribute(attribute)), 0);
                }
            }
            expect(warnings).toEqual([]);
        } finally {
            view.disposeSubtree();
        }
    }
);

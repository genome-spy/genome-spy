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
        {
            contextOptions: {
                baseConfig: resolveBaseConfig({
                    defaultConfig: INTERNAL_DEFAULT_CONFIG,
                    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
                }),
                viewFactoryOptions: { wrapRoot: true },
            },
        }
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

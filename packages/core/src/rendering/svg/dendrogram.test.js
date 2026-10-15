// @vitest-environment jsdom

import { expect, test } from "vitest";
import heatmapSpec from "../../../../../examples/core/marks/link/dendrogram-gaps.json" with { type: "json" };
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import UnitView from "../../view/unitView.js";
import { createSvg } from "./index.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

test.each([false, true])(
    "dendrogram endpoints stay joined and aligned through navigation, reverse=%s",
    async (reverse) => {
        const spec =
            /** @type {import("../../spec/root.js").RootSpec & typeof heatmapSpec} */ (
                structuredClone(heatmapSpec)
            );
        delete spec.height;
        spec.scales.y = {
            ...spec.scales.y,
            ...{
                reverse,
                gapPositions: [1, 3],
                gapWidth: 14,
            },
        };
        // Remove guides so every queried shape belongs to the compact data fixture.
        for (const child of spec.hconcat) {
            child.encoding.x.axis = null;
            child.encoding.y.axis = null;
        }
        const { view } = await createHeadlessEngine(spec, {
            contextOptions: { baseConfig },
        });
        const units = Array.from(view.getDescendants()).filter(
            (child) => child instanceof UnitView
        );
        const treeView = units.find((child) => child.name == "dendrogram");
        const heatmapView = units.find((child) => child.name == "heatmap");
        const resolution = treeView.getScaleResolution("y");
        expect(resolution).toBe(heatmapView.getScaleResolution("y"));
        const scale = resolution.getScale();
        expect(scale.props.reverse).toBe(reverse);
        expect(scale.props.gapWidth).toBe(14);
        const edges = Array.from(treeView.getCollector().getData());
        const cells = Array.from(heatmapView.getCollector().getData());
        expect(edges.some((edge) => edge.sourceOffset == 0.125)).toBe(true);

        let previousCellHeight = 0;
        for (const domain of [
            [0, 4],
            [0.2, 3.8],
        ]) {
            scale.domain(domain);
            for (const height of [180, 320]) {
                const { svg, warnings } = createSvg({
                    viewRoot: view,
                    logicalWidth: 600,
                    logicalHeight: height,
                });
                expect(warnings).toEqual([]);
                const paths = Array.from(
                    svg.querySelectorAll('[data-mark-type="link"] path')
                );
                const rects = Array.from(
                    svg.querySelectorAll('[data-mark-type="rect"] rect')
                );
                expect(paths).toHaveLength(edges.length);
                expect(rects).toHaveLength(cells.length);
                const positions = new Map();
                for (const [i, edge] of edges.entries()) {
                    const points = paths[i]
                        .getAttribute("d")
                        .match(/-?\d+(?:\.\d+)?/g)
                        .map(Number);
                    const [sx, sy, ex, ey, tx, ty] = points;
                    // Splits stay at the parent merge height.
                    expect(ex).toBe(sx);
                    expect(ey).toBe(ty);
                    for (const [id, point] of [
                        [edge.sourceId, [sx, sy]],
                        [edge.targetId, [tx, ty]],
                    ]) {
                        if (positions.has(id)) {
                            expect(point).toEqual(positions.get(id));
                        }
                        positions.set(id, point);
                    }
                    if (edge.targetHeight == 0) {
                        const cell =
                            rects[
                                cells.findIndex(
                                    (cell) => cell.row == edge.targetIndex
                                )
                            ];
                        const center =
                            +cell.getAttribute("y") +
                            +cell.getAttribute("height") / 2;
                        expect(Math.abs(ty - center)).toBeLessThan(0.11);
                    }
                    // Supplied heights control the independent quantitative axis.
                    expect(
                        (tx - sx) / (edge.sourceHeight - edge.targetHeight)
                    ).toBeCloseTo(60, 1);
                }
                const cellHeight = +rects[0].getAttribute("height");
                if (height == 320)
                    expect(cellHeight).toBeGreaterThan(previousCellHeight);
                previousCellHeight = cellHeight;
                expect(Array.from(treeView.getCollector().getData())).toEqual(
                    edges
                );
                expect(Array.from(treeView.getCollector().getData())[0]).toBe(
                    edges[0]
                );
                expect(scale(0.9)).toBe(scale(0));
            }
        }
        // Reuse the exact same collector output with the existing curved presentation.
        view.paramRuntime.setValue("shape", "diagonal");
        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 600,
            logicalHeight: 320,
        });
        expect(
            Array.from(
                svg.querySelectorAll('[data-mark-type="link"] path')
            ).every((path) => path.getAttribute("d").includes(" C "))
        ).toBe(true);
    }
);

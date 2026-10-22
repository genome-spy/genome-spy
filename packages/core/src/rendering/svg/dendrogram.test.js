// @vitest-environment jsdom

import { expect, onTestFinished, test } from "vitest";
import heatmapSpec from "../../../../../examples/core/marks/link/dendrogram-gaps.json" with { type: "json" };
import bandHeatmapSpec from "../../../../../examples/docs/grammar/transform/dendrogram/clustered-heatmap-band.json" with { type: "json" };
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
    "categorical trees align on both axes through replacement and resize, reverse=%s",
    async (reverse) => {
        const spec =
            /** @type {import("../../spec/root.js").RootSpec & typeof bandHeatmapSpec} */ (
                structuredClone(bandHeatmapSpec)
            );
        spec.spec.encoding.x.axis = null;
        spec.spec.encoding.y.axis = null;
        spec.spec.encoding.color.legend = null;
        spec.scales.x.reverse = reverse;
        spec.scales.y.reverse = reverse;
        spec.scales.x.paddingInner = reverse ? 0.3 : 0.08;
        spec.scales.y.paddingInner = reverse ? 0.3 : 0.08;
        const sampleTree =
            /** @type {import("../../spec/view.js").UnitSpec} */ (
                spec.surround.left[0]
            );
        const rows = spec.surround.left[0].data.values;
        spec.datasets = { samples: rows };
        sampleTree.data = { name: "samples" };
        const { view, context } = await createHeadlessEngine(spec, {
            contextOptions: {
                baseConfig,
                isViewConfiguredVisible: (view) => view.isVisibleInSpec(),
            },
        });
        onTestFinished(() => view.disposeSubtree());
        const find = (/** @type {string} */ name) =>
            /** @type {UnitView} */ (
                view.getDescendants().find((child) => child.name === name)
            );
        const matrix = find("matrix");
        const cells = Array.from(matrix.getCollector().getData());
        for (const replacement of [false, true]) {
            if (replacement) {
                for (const row of rows)
                    if (row.parent === "sCA")
                        row.childOrder = 1 - row.childOrder;
                context.dataFlow.updateNamedDataBinding(
                    view.namedDataScope.getLocalBinding("samples"),
                    rows
                );
                await view.paramRuntime.whenPropagated();
            }
            expect(matrix.getScaleResolution("y").getScale().domain()).toEqual(
                replacement
                    ? ["Sample A", "Sample C", "Sample D", "Sample B"]
                    : ["Sample C", "Sample A", "Sample D", "Sample B"]
            );
            for (const size of [
                [600, 400],
                [750, 520],
            ]) {
                const { svg, warnings } = createSvg({
                    viewRoot: view,
                    logicalWidth: size[0],
                    logicalHeight: size[1],
                });
                expect(warnings).toEqual([]);
                const rects = Array.from(
                    svg.querySelectorAll('[data-name="matrix"] rect')
                );
                expect(rects).toHaveLength(16);
                for (const [name, axis, field] of /** @type {const} */ ([
                    ["sampleTree", "y", "sample"],
                    ["geneTree", "x", "gene"],
                ])) {
                    const tree = find(name);
                    expect(tree.getScaleResolution(axis)).toBe(
                        matrix.getScaleResolution(axis)
                    );
                    const edges = Array.from(tree.getCollector().getData());
                    const paths = Array.from(
                        svg.querySelectorAll('[data-name="' + name + '"] path')
                    );
                    expect(paths).toHaveLength(6);
                    const positions = new Map();
                    for (const [i, edge] of edges.entries()) {
                        const [sx, sy, ex, ey, tx, ty] = paths[i]
                            .getAttribute("d")
                            .match(/-?\d+(?:\.\d+)?/g)
                            .map(Number);
                        expect(axis === "y" ? ex : ey).toBe(
                            axis === "y" ? sx : sy
                        );
                        for (const [id, point] of [
                            [edge.sourceId, [sx, sy]],
                            [edge.targetId, [tx, ty]],
                        ]) {
                            if (positions.has(id))
                                expect(point).toEqual(positions.get(id));
                            positions.set(id, point);
                        }
                        if (edge.targetHeight === 0) {
                            const cell =
                                rects[
                                    cells.findIndex(
                                        (cell) =>
                                            cell[field] === edge.targetValue
                                    )
                                ];
                            const center =
                                +cell.getAttribute(axis) +
                                +cell.getAttribute(
                                    axis === "y" ? "height" : "width"
                                ) /
                                    2;
                            expect(
                                Math.abs((axis === "y" ? ty : tx) - center)
                            ).toBeLessThan(0.11);
                        }
                    }
                }
            }
        }
        find("sampleTree").spec.visible = false;
        find("geneTree").spec.visible = false;
        const hidden = createSvg({
            viewRoot: view,
            logicalWidth: 600,
            logicalHeight: 400,
        }).svg;
        expect(
            hidden.querySelectorAll('[data-mark-type="link"] path')
        ).toHaveLength(0);
        expect(
            hidden.querySelectorAll('[data-name="matrix"] rect')
        ).toHaveLength(16);
        expect(view.paramRuntime.getValue("geneOrder")).toEqual([
            "TP53",
            "MYC",
            "EGFR",
            "BRCA1",
        ]);
    }
);

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

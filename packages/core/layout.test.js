import { specToLayout } from "./src/view/testUtils";
import { describe, expect, test } from "vitest";

import specPoint2D from "../../examples/core/marks/point/point2d.json";
import specComplexGridLayout from "../../examples/core/layout/grid/complex_grid_layout.json";
import specComplexGridLayout2 from "../../examples/core/layout/grid/complex_grid_layout2.json";
import specConcatPointsText from "../../examples/core/layout/grid/concat_points_text.json";
import specSharedAxisAtRoot from "../../examples/core/layout/grid/shared_axis_at_root.json";
import specCondensedConcat from "../../examples/core/layout/grid/condensed_concat.json";
import specConfigImportedTrack from "../../examples/core/config/config-imported-track.json";
import specConfigThemeComparisonBars from "../../examples/core/config/config-theme-comparison-bars.json";

/** @typedef {{ viewName: string, coords?: string, children: LayoutNode[] }} LayoutNode */

/**
 * @param {LayoutNode} node
 * @param {string} viewName
 * @returns {LayoutNode | undefined}
 */
function findLayoutNode(node, viewName) {
    if (node.viewName === viewName) {
        return node;
    }

    for (const child of node.children) {
        const found = findLayoutNode(child, viewName);
        if (found) {
            return found;
        }
    }
}

/**
 * @param {LayoutNode} node
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function bounds(node) {
    const coords = node.coords;
    if (!coords) {
        throw new Error("Layout node has no coordinates: " + node.viewName);
    }

    /** @param {"x" | "y" | "width" | "height"} key */
    const read = (key) => {
        const match = coords.match(new RegExp(key + ": ([0-9.-]+)"));
        if (!match) {
            throw new Error("Coordinate not found: " + key);
        }
        return Number(match[1]);
    };

    return {
        x: read("x"),
        y: read("y"),
        width: read("width"),
        height: read("height"),
    };
}

describe("example layout", () => {
    test("point plot reserves space beside the plot for its legend", async () => {
        const layout = await specToLayout(specPoint2D);
        const plot = bounds(findLayoutNode(layout, "grid0"));
        const legend = bounds(findLayoutNode(layout, "legend_region_right"));

        expect(plot).toMatchObject({ width: 300, height: 300 });
        expect(legend.x).toBe(plot.x + plot.width + 18);
        expect(legend.height).toBeGreaterThan(0);
        expect(legend.height).toBeLessThanOrEqual(plot.height);
    });

    test("nested grid rows stay inside their column", async () => {
        const layout = await specToLayout(specComplexGridLayout);
        const leftNode = layout.children.find(
            (node) => node.viewName === "grid0"
        );
        const left = bounds(leftNode);
        const right = bounds(
            layout.children.find((node) => node.viewName === "grid1")
        );
        const nested = bounds(findLayoutNode(leftNode, "grid1"));

        expect(right.x).toBeGreaterThan(left.x + left.width);
        expect(nested.x).toBeGreaterThanOrEqual(left.x);
        expect(nested.x + nested.width).toBeLessThanOrEqual(
            left.x + left.width
        );
        expect(nested.y).toBeGreaterThan(left.y);
    });

    test("two nested grid columns align and retain opposite axes", async () => {
        const layout = await specToLayout(specComplexGridLayout2);
        const left = findLayoutNode(layout, "left");
        const right = findLayoutNode(layout, "right");
        const leftBounds = bounds(left);
        const rightBounds = bounds(right);

        expect(rightBounds.x).toBe(leftBounds.x + leftBounds.width + 10);
        expect(rightBounds.y).toBe(leftBounds.y);
        expect(rightBounds.height).toBe(leftBounds.height);
        expect(findLayoutNode(left, "axis_top")).toBeDefined();
        expect(findLayoutNode(right, "axis_right")).toBeDefined();
    });

    test("shared x axis keeps point and text tracks aligned", async () => {
        const layout = await specToLayout(specConcatPointsText);
        const points = bounds(findLayoutNode(layout, "Points"));
        const text = bounds(findLayoutNode(layout, "Text"));

        expect(text.x).toBe(points.x);
        expect(text.width).toBe(points.width);
        expect(text.y).toBe(points.y + points.height + 10);
        expect(
            layout.children.filter((node) => node.viewName === "axis_bottom")
        ).toHaveLength(1);
    });

    test("a root-level shared axis spans both tracks", async () => {
        const layout = await specToLayout(specSharedAxisAtRoot);
        const upper = bounds(findLayoutNode(layout, "grid0"));
        const lower = bounds(findLayoutNode(layout, "grid1"));
        const axes = layout.children.filter(
            (node) => node.viewName === "axis_bottom"
        );

        expect(axes).toHaveLength(1);
        expect(bounds(axes[0])).toMatchObject({
            x: upper.x,
            width: upper.width,
        });
        expect(lower.x).toBe(upper.x);
        expect(lower.y).toBe(upper.y + upper.height + 10);
        expect(bounds(axes[0]).y).toBe(lower.y + lower.height);
    });

    test("zero-spacing concat keeps three tracks adjacent", async () => {
        const layout = await specToLayout(specCondensedConcat);
        const rows = ["grid0", "grid1", "grid2"].map((name) =>
            bounds(findLayoutNode(layout, name))
        );

        expect(rows.map((row) => row.x)).toEqual([
            rows[0].x,
            rows[0].x,
            rows[0].x,
        ]);
        expect(rows.map((row) => row.width)).toEqual([
            rows[0].width,
            rows[0].width,
            rows[0].width,
        ]);
        expect(
            Math.abs(rows[1].y - rows[0].y - rows[0].height)
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(rows[2].y - rows[1].y - rows[1].height)
        ).toBeLessThanOrEqual(1);
    });

    test("imported tracks occupy separate aligned rows", async () => {
        const layout = await specToLayout(specConfigImportedTrack);
        const first = bounds(findLayoutNode(layout, "track-a"));
        const second = bounds(findLayoutNode(layout, "track-b"));

        expect(second.x).toBe(first.x);
        expect(second.width).toBe(first.width);
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    });

    test("theme comparison aligns bars and scatter panels", async () => {
        const layout = await specToLayout(specConfigThemeComparisonBars);
        const bars = ["genomespy-bars", "vegalite-like-bars"].map((name) =>
            bounds(findLayoutNode(layout, name))
        );
        const scatter = ["genomespy-scatter", "vegalite-like-scatter"].map(
            (name) => bounds(findLayoutNode(layout, name))
        );

        expect(bars[0].y).toBe(bars[1].y);
        expect(scatter[0].y).toBe(scatter[1].y);
        expect(scatter.map((panel) => panel.x)).toEqual(
            bars.map((panel) => panel.x)
        );
        expect(scatter[0].y).toBeGreaterThan(bars[0].y + bars[0].height);
    });
});

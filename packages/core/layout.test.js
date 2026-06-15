import { specToLayout } from "./src/view/testUtils";
import { describe, expect, test } from "vitest";

import specFirst from "../../examples/core/first.json";
import specPoint2D from "../../examples/core/marks/point/point2d.json";
import specComplexGridLayout from "../../examples/core/layout/grid/complex_grid_layout.json";
import specComplexGridLayout2 from "../../examples/core/layout/grid/complex_grid_layout2.json";
import specConcatPointsText from "../../examples/core/layout/grid/concat_points_text.json";
import specSharedAxisAtRoot from "../../examples/core/layout/grid/shared_axis_at_root.json";
import specCondensedConcat from "../../examples/core/layout/grid/condensed_concat.json";
import specConfigBasic from "../../examples/core/config/config-basic.json";
import specConfigScopedView from "../../examples/core/config/config-scoped-view.json";
import specConfigImportedTrack from "../../examples/core/config/config-imported-track.json";
import specConfigImportOverride from "../../examples/core/config/config-import-override.json";
import specConfigScaleSchemesByType from "../../examples/core/config/config-scale-schemes-by-type.json";
import specConfigThemeComparisonBars from "../../examples/core/config/config-theme-comparison-bars.json";

/**
 * @param {{ viewName: string, coords?: string, children: any[] }} node
 * @param {string} viewName
 * @returns {{ viewName: string, coords?: string, children: any[] } | undefined}
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
 * @param {string} coords
 * @param {"x" | "y" | "width" | "height"} key
 */
function readCoord(coords, key) {
    const match = coords.match(new RegExp(key + ": ([0-9.-]+)"));
    if (!match) {
        throw new Error("Coordinate not found: " + key);
    }

    return Number(match[1]);
}

describe("Test layout process", () => {
    // TODO: Figure out how to construct this list automatically.

    test("first.json", async () => {
        expect(await specToLayout(specFirst)).toMatchSnapshot();
    });

    test("marks/point/point2d.json", async () => {
        expect(await specToLayout(specPoint2D)).toMatchSnapshot();
    });

    test("marks/point/point2d.json with legend enabled", async () => {
        const layout = await specToLayout(specPoint2D);
        const plot = findLayoutNode(layout, "grid0");
        const legend = findLayoutNode(layout, "legend_right");

        expect(plot).toBeDefined();
        expect(legend).toBeDefined();
        expect(readCoord(plot.coords, "width")).toBe(200);
        expect(readCoord(plot.coords, "height")).toBe(200);
        expect(readCoord(legend.coords, "x")).toBe(
            readCoord(plot.coords, "x") + readCoord(plot.coords, "width") + 18
        );
        expect(readCoord(legend.coords, "height")).toBe(
            readCoord(plot.coords, "height")
        );
    });

    test("layout/grid/complex_grid_layout.json", async () => {
        expect(await specToLayout(specComplexGridLayout)).toMatchSnapshot();
    });

    test("layout/grid/complex_grid_layout2.json", async () => {
        expect(await specToLayout(specComplexGridLayout2)).toMatchSnapshot();
    });

    test("layout/grid/concat_points_text.json", async () => {
        expect(await specToLayout(specConcatPointsText)).toMatchSnapshot();
    });

    test("layout/grid/shared_axis_at_root.json", async () => {
        expect(await specToLayout(specSharedAxisAtRoot)).toMatchSnapshot();
    });

    test("layout/grid/condensed_concat.json", async () => {
        expect(await specToLayout(specCondensedConcat)).toMatchSnapshot();
    });

    test("config/config-basic.json", async () => {
        expect(await specToLayout(specConfigBasic)).toMatchSnapshot();
    });

    test("config/config-scoped-view.json", async () => {
        expect(await specToLayout(specConfigScopedView)).toMatchSnapshot();
    });

    test("config/config-imported-track.json", async () => {
        expect(await specToLayout(specConfigImportedTrack)).toMatchSnapshot();
    });

    test("config/config-import-override.json", async () => {
        expect(await specToLayout(specConfigImportOverride)).toMatchSnapshot();
    });

    test("config/config-scale-schemes-by-type.json", async () => {
        expect(
            await specToLayout(specConfigScaleSchemesByType)
        ).toMatchSnapshot();
    });

    test("config/config-theme-comparison-bars.json", async () => {
        expect(
            await specToLayout(specConfigThemeComparisonBars)
        ).toMatchSnapshot();
    });
});

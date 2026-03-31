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

describe("Test layout process", () => {
    // TODO: Figure out how to construct this list automatically.

    test("first.json", async () => {
        expect(await specToLayout(specFirst)).toMatchSnapshot();
    });

    test("marks/point/point2d.json", async () => {
        expect(await specToLayout(specPoint2D)).toMatchSnapshot();
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

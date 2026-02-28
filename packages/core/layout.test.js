import { create } from "./src/view/testUtils";
import { describe, expect, test } from "vitest";

import DebugginViewRenderingContext from "./src/view/renderingContext/debuggingViewRenderingContext";
import Rectangle from "./src/view/layout/rectangle";
import { calculateCanvasSize } from "./src/view/viewUtils";

import specFirst from "../../examples/core/first.json";
import specPoint2D from "../../examples/core/marks/point/point2d.json";
import specComplexGridLayout from "../../examples/core/layout/grid/complex_grid_layout.json";
import specComplexGridLayout2 from "../../examples/core/layout/grid/complex_grid_layout2.json";
import specConcatPointsText from "../../examples/core/layout/grid/concat_points_text.json";
import specSharedAxisAtRoot from "../../examples/core/layout/grid/shared_axis_at_root.json";
import specCondensedConcat from "../../examples/core/layout/grid/condensed_concat.json";
import View from "./src/view/view";
import specConfigBasic from "./examples/config/config-basic.json";
import specConfigScopedView from "./examples/config/config-scoped-view.json";
import specConfigImportedTrack from "./examples/config/config-imported-track.json";
import specConfigImportOverride from "./examples/config/config-import-override.json";
import specConfigScaleSchemesByType from "./examples/config/config-scale-schemes-by-type.json";

/**
 * @typedef {import("./src/spec/root").RootSpec} RootSpec
 */

/**
 * @param {RootSpec} spec
 */
async function specToLayout(spec) {
    const view = await create(/** @type {ViewSpec} */ (spec), View, {
        wrapRoot: true,
    });
    const renderingContext = new DebugginViewRenderingContext({});

    const canvasSize = calculateCanvasSize(view);
    const rect = Rectangle.create(
        0,
        0,
        canvasSize.width ?? 1500,
        canvasSize.height ?? 1000
    );

    view.render(renderingContext, rect);

    return renderingContext.getLayout();
}

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
});

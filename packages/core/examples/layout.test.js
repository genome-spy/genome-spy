import { create } from "../src/view/testUtils";
import { describe, expect, test } from "vitest";

import DebugginViewRenderingContext from "../src/view/renderingContext/debuggingViewRenderingContext";
import Rectangle from "../src/view/layout/rectangle";
import { calculateCanvasSize } from "../src/view/viewUtils";

import specFirst from "./first.json";
import specPoint2D from "./marks/point/point2d.json";
import specComplexGridLayout from "./layout/grid/complex_grid_layout.json";
import specComplexGridLayout2 from "./layout/grid/complex_grid_layout2.json";
import specConcatPointsText from "./layout/grid/concat_points_text.json";
import specSharedAxisAtRoot from "./layout/grid/shared_axis_at_root.json";
import specCondensedConcat from "./layout/grid/condensed_concat.json";
import View from "../src/view/view";

/**
 * @typedef {import("../src/spec/root").RootSpec} RootSpec
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
});

import { createAndWrap } from "../src/view/testUtils";
import { describe, expect, test } from "vitest";

import DebugginViewRenderingContext from "../src/view/renderingContext/debuggingViewRenderingContext";
import Rectangle from "../src/utils/layout/rectangle";
import { calculateCanvasSize } from "../src/view/viewUtils";

import specFirst from "./first.json";
import specPoint2D from "./point2d.json";
import specComplexGridLayout from "./layout/complex_grid_layout.json";
import specComplexGridLayout2 from "./layout/complex_grid_layout2.json";
import specConcatPointsText from "./layout/concat_points_text.json";
import specSharedAxisAtRoot from "./layout/shared_axis_at_root.json";
import specCondensedConcat from "./layout/condensed_concat.json";

/**
 * @typedef {import("../src/spec/root").RootSpec} RootSpec
 */

/**
 * @param {RootSpec} spec
 */
async function specToLayout(spec) {
    const view = await createAndWrap(/** @type {ViewSpec} */ (spec));
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

    test("point2d.json", async () => {
        expect(await specToLayout(specPoint2D)).toMatchSnapshot();
    });

    test("layout/complex_grid_layout.json", async () => {
        expect(await specToLayout(specComplexGridLayout)).toMatchSnapshot();
    });

    test("layout/complex_grid_layout2.json", async () => {
        expect(await specToLayout(specComplexGridLayout2)).toMatchSnapshot();
    });

    test("layout/concat_points_text.json", async () => {
        expect(await specToLayout(specConcatPointsText)).toMatchSnapshot();
    });

    test("layout/shared_axis_at_root.json", async () => {
        expect(await specToLayout(specSharedAxisAtRoot)).toMatchSnapshot();
    });

    test("layout/condensed_concat.json", async () => {
        expect(await specToLayout(specCondensedConcat)).toMatchSnapshot();
    });
});

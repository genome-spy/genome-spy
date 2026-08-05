import { expect, test } from "vitest";

import UnitView from "../view/unitView.js";
import { createAndInitialize } from "../view/testUtils.js";

test("point semantic threshold is defined for empty data", async () => {
    const view = await createAndInitialize(
        {
            data: { values: [] },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                semanticScore: { field: "score" },
            },
        },
        UnitView
    );

    const mark = /** @type {import("./point.js").default} */ (view.mark);
    expect(mark.getSemanticThreshold()).toBe(-1);
});

test.each(["x", "+"])(
    "%s shape retains its line width without an explicit stroke",
    async (shape) => {
        const view = await createAndInitialize(
            {
                data: { values: [{}] },
                mark: { type: "point", shape },
            },
            UnitView
        );

        expect(view.mark.encoding.stroke).toEqual({ value: null });
        expect(view.mark.encoding.strokeOpacity).toEqual({ value: 0 });
        expect(view.mark.encoding.strokeWidth).toEqual({ value: 2 });
    }
);

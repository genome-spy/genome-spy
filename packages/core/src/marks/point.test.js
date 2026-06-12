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

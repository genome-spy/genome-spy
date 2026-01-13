import { describe, expect, test } from "vitest";

import UnitView from "./unitView.js";
import { create } from "./testUtils.js";

describe("View disposal", () => {
    test("removes scale and axis resolutions for disposed unit views", async () => {
        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: {
                values: [
                    {
                        x: 1,
                        y: 2,
                    },
                ],
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        const view = await create(spec, UnitView);

        expect(view.getScaleResolution("x")).toBeDefined();
        expect(view.getAxisResolution("x")).toBeDefined();

        view.disposeSubtree();

        expect(view.getScaleResolution("x")).toBeUndefined();
        expect(view.getAxisResolution("x")).toBeUndefined();
    });
});

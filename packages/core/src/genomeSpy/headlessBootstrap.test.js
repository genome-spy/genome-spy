import { describe, expect, test } from "vitest";

import UnitView from "../view/unitView.js";
import { createHeadlessEngine } from "./headlessBootstrap.js";
import { toRegularArray as r } from "../utils/domainArray.js";

describe("headless bootstrap", () => {
    test("initializes a full view hierarchy without DOM or WebGL", async () => {
        // Use the headless helper directly to exercise the shared engine path.
        const { view, context } = await createHeadlessEngine(
            {
                data: { name: "points" },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            },
            {
                contextOptions: {
                    getNamedDataFromProvider: (name) =>
                        name === "points"
                            ? [{ x: 1 }, { x: 2 }, { x: 3 }]
                            : undefined,
                },
            }
        );

        expect(view).toBeInstanceOf(UnitView);
        expect(context.glHelper).toBeUndefined();
        expect(view.getDataInitializationState()).toBe("ready");
        expect(view.flowHandle?.collector).toBeDefined();
        expect(r(view.getScaleResolution("x").getDataDomain())).toEqual([1, 3]);
    });
});

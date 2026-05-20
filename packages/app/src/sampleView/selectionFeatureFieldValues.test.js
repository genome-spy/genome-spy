// @ts-check
import { describe, expect, test } from "vitest";
import { InternMap } from "internmap";
import ViewParamRuntime from "@genome-spy/core/paramRuntime/viewParamRuntime.js";
import { createAccessor } from "@genome-spy/core/encoder/accessor.js";
import { createIntervalSelection } from "@genome-spy/core/selection/selection.js";
import { collectSelectionFeatureFieldValues } from "./selectionFeatureFieldValues.js";

describe("collectSelectionFeatureFieldValues", () => {
    test("collects raw field values inside the selected interval", () => {
        const rootViewParamRuntime = new ViewParamRuntime(() => undefined);
        const setBrush = rootViewParamRuntime.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });
        const brush = createIntervalSelection(["x"]);
        brush.intervals.x = [4, 6];
        setBrush(brush);

        const root = {
            paramRuntime: rootViewParamRuntime,
            visit: (visitor) => visitor(root),
            getDataAncestors: () => [root],
        };

        const paramRuntime = new ViewParamRuntime(() => undefined);
        const xAccessor = createAccessor("x", { field: "pos" }, paramRuntime);
        const facetBatches = new InternMap([], JSON.stringify);
        facetBatches.set(
            ["sample-1"],
            [
                { pos: 3, consequence: "outside" },
                { pos: 4, consequence: "missense" },
            ]
        );
        facetBatches.set(
            ["sample-2"],
            [
                { pos: 5, consequence: "frameshift" },
                { pos: 7, consequence: "outside" },
            ]
        );

        const view =
            /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
                /** @type {any} */ ({
                    getCollector: () => ({ facetBatches }),
                    getDataAccessor: (channel) =>
                        channel === "x" ? xAccessor : undefined,
                    getLayoutAncestors: () => [root],
                    getScaleResolution: () => ({
                        getScale: () => ({ type: "linear" }),
                    }),
                    mark: { defaultHitTestMode: "intersects" },
                })
            );

        const values = collectSelectionFeatureFieldValues(
            view,
            { scope: [], param: "brush" },
            "consequence"
        );

        expect(values).toEqual(["missense", "frameshift"]);
    });
});

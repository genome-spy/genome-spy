// @ts-check
import { describe, expect, it } from "vitest";
import { createPlotBookmarkAttachment } from "./plotBookmarkActions.js";

describe("createPlotBookmarkAttachment", () => {
    it("stores the plot definition without copying the generated title", () => {
        const definition = {
            plotType: "barplot",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "status" },
        };
        const plot =
            /** @type {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} */ (
                /** @type {any} */ ({
                    kind: "sample_attribute_plot",
                    plotType: "barplot",
                    request: definition,
                    title: "Bar plot of status",
                })
            );

        expect(createPlotBookmarkAttachment(plot)).toEqual({
            kind: "sample_attribute_plot",
            definition,
        });
    });
});

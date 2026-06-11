// @ts-check
import { describe, expect, it } from "vitest";
import { createPlotBookmarkAttachment } from "./plotBookmarkActions.js";

describe("createPlotBookmarkAttachment", () => {
    it("uses the plot request without copying the generated title", () => {
        const request = {
            plotType: "bar",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "status" },
        };
        const plot =
            /** @type {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} */ (
                /** @type {any} */ ({
                    kind: "sample_attribute_plot",
                    plotType: "barplot",
                    request,
                    title: "Bar plot of status",
                })
            );

        expect(createPlotBookmarkAttachment(plot)).toEqual({
            kind: "sample_attribute_plot",
            request,
        });
    });
});

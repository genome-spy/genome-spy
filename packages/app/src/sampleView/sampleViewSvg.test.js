// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { prepareViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import { initializeViewData } from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { createSvg } from "@genome-spy/core/svg/index.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import MergeSampleFacets from "./mergeFacets.js";

transforms.mergeFacets = MergeSampleFacets;

describe("SampleView SVG export", () => {
    test("exports uniform plots and texture-indexed sample labels", async () => {
        const { view, context } = await createSampleViewForTest({
            initializeFlow: false,
            disableGroupUpdates: false,
            spec: {
                config: { mark: { color: "black" } },
                samples: {
                    identity: {
                        data: {
                            values: [
                                { sample: "S1", displayName: "Control" },
                                { sample: "S2", displayName: "Treatment" },
                            ],
                        },
                        idField: "sample",
                        displayNameField: "displayName",
                    },
                },
                spec: {
                    data: { values: [{}] },
                    mark: { type: "text", text: "Plot" },
                    encoding: {
                        x: { value: 0.5 },
                        y: { value: 0.5 },
                    },
                },
            },
        });
        prepareViewHierarchy(view);
        await initializeViewData(
            view,
            context.dataFlow,
            context.fontManager,
            () => undefined
        );

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 200,
        });
        const texts = Array.from(svg.querySelectorAll("text"), (text) => ({
            value: text.textContent,
            y: +text.getAttribute("y"),
            clip: text
                .closest('[data-mark-type="text"]')
                ?.getAttribute("clip-path"),
        }));
        const plotRows = texts.filter(({ value }) => value == "Plot");

        expect(plotRows).toHaveLength(2);
        expect(plotRows[0].y).not.toBe(plotRows[1].y);
        expect(texts.map(({ value }) => value)).toEqual(
            expect.arrayContaining(["Control", "Treatment"])
        );
        expect(new Set(plotRows.map(({ clip }) => clip)).size).toBe(1);
        expect(warnings).toEqual([]);
    });
});

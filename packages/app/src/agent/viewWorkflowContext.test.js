// @ts-check
import { describe, expect, it, vi } from "vitest";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    resolveParamSelector: resolveParamSelectorMock,
}));

import { getViewWorkflowContext } from "./viewWorkflowContext.js";

describe("getViewWorkflowContext", () => {
    it("builds selection and field capabilities from the current visualization", () => {
        const betaView = {
            explicitName: "betaTrack",
            getTitleText: () => "Beta Track",
            getEncoding: () => ({
                x: { field: "pos", type: "locus" },
                y: { field: "beta", type: "quantitative" },
            }),
        };

        resolveParamSelectorMock.mockReturnValue({ view: betaView });

        const app = {
            getSampleView: () => ({
                visit: (visitor) => visitor(betaView),
            }),
            provenance: {
                getPresentState: () => ({
                    paramProvenance: {
                        entries: {
                            brush: {
                                selector: { scope: [], param: "brush" },
                                value: { type: "interval", value: [0, 1] },
                            },
                        },
                    },
                }),
            },
        };

        const context = getViewWorkflowContext(app);

        expect(context.workflows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    workflowType: "deriveMetadataFromSelection",
                }),
                expect.objectContaining({
                    workflowType: "createBoxplotFromSelection",
                }),
            ])
        );
        expect(context.selections).toEqual([
            expect.objectContaining({
                label: "brush",
            }),
        ]);
        expect(context.fields).toEqual([
            expect.objectContaining({
                field: "beta",
                supportedAggregations: expect.arrayContaining([
                    "weightedMean",
                    "variance",
                ]),
            }),
        ]);
    });
});

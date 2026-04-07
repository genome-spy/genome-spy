// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));
const { getParamSelectorMock } = vi.hoisted(() => ({
    getParamSelectorMock: vi.fn(),
}));
const { asSelectionConfigMock } = vi.hoisted(() => ({
    asSelectionConfigMock: vi.fn((config) => config),
}));
const { isPointSelectionConfigMock } = vi.hoisted(() => ({
    isPointSelectionConfigMock: vi.fn(() => false),
}));
const { isIntervalSelectionConfigMock } = vi.hoisted(() => ({
    isIntervalSelectionConfigMock: vi.fn(
        (config) => config?.type === "interval"
    ),
}));
const { getBookmarkableParamsMock } = vi.hoisted(() => ({
    getBookmarkableParamsMock: vi.fn(() => []),
}));

vi.mock("@genome-spy/core/selection/selection.js", () => ({
    asSelectionConfig: asSelectionConfigMock,
    isIntervalSelectionConfig: isIntervalSelectionConfigMock,
    isPointSelectionConfig: isPointSelectionConfigMock,
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    getBookmarkableParams: getBookmarkableParamsMock,
    resolveParamSelector: resolveParamSelectorMock,
    getParamSelector: getParamSelectorMock,
}));

import { getViewWorkflowContext } from "./viewWorkflowContext.js";

describe("getViewWorkflowContext", () => {
    it("builds selection and field capabilities from the current visualization", () => {
        const betaView = {
            explicitName: "betaTrack",
            getTitleText: () => "Beta Track",
            paramRuntime: {
                paramConfigs: new Map([
                    [
                        "brush",
                        {
                            name: "brush",
                            description: "Brush the beta interval.",
                            persist: true,
                            select: {
                                type: "interval",
                                encodings: ["x"],
                            },
                        },
                    ],
                ]),
                getValue: (paramName) =>
                    paramName === "brush"
                        ? { type: "interval", value: [0, 1] }
                        : undefined,
            },
            getEncoding: () => ({
                x: { field: "pos", type: "locus" },
                y: {
                    field: "beta",
                    type: "quantitative",
                    description: "Beta-value track",
                },
            }),
        };

        resolveParamSelectorMock.mockReturnValue({ view: betaView });
        getParamSelectorMock.mockReturnValue({
            scope: [],
            param: "brush",
        });

        const sampleView = {
            paramRuntime: betaView.paramRuntime,
            visit: (visitor) => visitor(betaView),
        };

        const app = {
            getSampleView: () => sampleView,
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
                description: "Brush the beta interval.",
            }),
        ]);
        expect(context.fields).toEqual([
            expect.objectContaining({
                field: "beta",
                description: "Beta-value track",
                supportedAggregations: expect.arrayContaining([
                    "weightedMean",
                    "variance",
                ]),
            }),
        ]);
    });
});

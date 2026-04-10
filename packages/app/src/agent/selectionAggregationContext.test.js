// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));
const { getParamSelectorMock } = vi.hoisted(() => ({
    getParamSelectorMock: vi.fn(),
}));
const { getViewSelectorMock } = vi.hoisted(() => ({
    getViewSelectorMock: vi.fn((view) => ({
        scope: [],
        view: view.explicitName,
    })),
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
const { visitAddressableViewsMock } = vi.hoisted(() => ({
    visitAddressableViewsMock: vi.fn((root, visitor) => {
        root.visit(visitor);
    }),
}));

vi.mock("@genome-spy/core/selection/selection.js", () => ({
    asSelectionConfig: asSelectionConfigMock,
    isIntervalSelectionConfig: isIntervalSelectionConfigMock,
    isPointSelectionConfig: isPointSelectionConfigMock,
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getBookmarkableParams: getBookmarkableParamsMock,
        getViewSelector: getViewSelectorMock,
        resolveParamSelector: resolveParamSelectorMock,
        getParamSelector: getParamSelectorMock,
        visitAddressableViews: visitAddressableViewsMock,
    };
});

import { getSelectionAggregationContext } from "./selectionAggregationContext.js";

describe("getSelectionAggregationContext", () => {
    it("builds selection and field capabilities from the current visualization", async () => {
        const spec = {
            data: {
                values: [
                    { sample: "S1", gene: "EGFR", beta: 1.2 },
                    { sample: "S2", gene: "TP53", beta: -0.4 },
                ],
            },
            samples: {},
            spec: {
                name: "track",
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "gene", type: "nominal" },
                    fill: {
                        field: "beta",
                        type: "quantitative",
                        description: "Beta-value track",
                    },
                },
            },
        };

        getParamSelectorMock.mockReturnValue({
            scope: [],
            param: "brush",
        });

        const { view } = await createSampleViewForTest({ spec });
        const targetView = view.findDescendantByName("track");
        resolveParamSelectorMock.mockReturnValue({ view: targetView });
        Object.defineProperty(view.paramRuntime, "paramConfigs", {
            value: new Map([
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
        });

        const app = {
            getSampleView: () => view,
            provenance: {
                getPresentState: () => ({
                    paramProvenance: {
                        entries: {
                            brush: {
                                selector: { scope: [], param: "brush" },
                                value: { type: "interval", value: [0, 1] },
                            },
                            brush2: {
                                selector: { scope: [], param: "brush2" },
                                value: { type: "interval", value: [1, 2] },
                            },
                        },
                    },
                }),
            },
        };

        const context = getSelectionAggregationContext(app);

        expect(context.fields).toEqual([
            expect.objectContaining({
                field: "beta",
                candidateId: "brush@track:beta",
                viewSelector: {
                    scope: [],
                    view: "track",
                },
                selectionSelector: {
                    scope: [],
                    param: "brush",
                },
                supportedAggregations: expect.arrayContaining([
                    "weightedMean",
                    "variance",
                ]),
            }),
            expect.objectContaining({
                field: "beta",
                candidateId: "brush2@track:beta",
                viewSelector: {
                    scope: [],
                    view: "track",
                },
                selectionSelector: {
                    scope: [],
                    param: "brush2",
                },
                supportedAggregations: expect.arrayContaining([
                    "weightedMean",
                    "variance",
                ]),
            }),
        ]);
        expect(context.fields[0]).not.toHaveProperty("viewTitle");
        expect(context.fields[0]).not.toHaveProperty("description");
    });
});

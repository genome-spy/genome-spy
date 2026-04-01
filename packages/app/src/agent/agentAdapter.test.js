// @ts-check
import { beforeEach, describe, expect, it, vi } from "vitest";

const { showMessageDialog, getAgentContext } = vi.hoisted(() => ({
    showMessageDialog: vi.fn(),
    getAgentContext: vi.fn(() => ({ schemaVersion: 1 })),
}));
const { showAgentChoiceDialog } = vi.hoisted(() => ({
    showAgentChoiceDialog: vi.fn(),
}));
const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));
const { showHierarchyBoxplotDialog } = vi.hoisted(() => ({
    showHierarchyBoxplotDialog: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("../components/generic/messageDialog.js", () => ({
    showMessageDialog,
}));

vi.mock("../components/dialogs/agentChoiceDialog.js", () => ({
    showAgentChoiceDialog,
}));

vi.mock("./contextBuilder.js", () => ({
    getAgentContext,
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    resolveParamSelector: resolveParamSelectorMock,
}));

vi.mock("../charts/hierarchyBoxplotDialog.js", () => ({
    __esModule: true,
    default: showHierarchyBoxplotDialog,
}));

import { createAgentAdapter } from "./agentAdapter.js";
import { createFieldId } from "./viewWorkflowContext.js";

function createResponse(body) {
    return {
        ok: true,
        headers: {
            get: () => null,
        },
        json: async () => body,
    };
}

function createAppStub(encoding = undefined) {
    const betaView = {
        explicitName: "betaTrack",
        getTitleText: () => "Beta Track",
        getEncoding: () =>
            encoding ?? {
                x: { field: "pos", type: "locus" },
                y: { field: "beta", type: "quantitative" },
            },
    };
    const sampleView = {
        sampleHierarchy: {
            sampleData: {
                ids: ["sampleA", "sampleB"],
                entities: {
                    sampleA: { id: "sampleA" },
                    sampleB: { id: "sampleB" },
                },
            },
            sampleMetadata: {
                attributeNames: [],
                attributeDefs: {},
            },
            groupMetadata: [],
            rootGroup: {
                name: "ROOT",
                samples: ["sampleA", "sampleB"],
                groups: [{ name: "group", samples: ["sampleA", "sampleB"] }],
            },
        },
        visit: (visitor) => visitor(betaView),
        actions: {
            sortBy: (payload) => ({
                type: "sampleView/sortBy",
                payload,
            }),
            groupByNominal: (payload) => ({
                type: "sampleView/groupByNominal",
                payload,
            }),
            deriveMetadata: (payload) => ({
                type: "sampleView/deriveMetadata",
                payload,
            }),
        },
        compositeAttributeInfoSource: {
            getAttributeInfo: () => ({
                accessor: () => undefined,
                valuesProvider: () => [],
                type: "quantitative",
            }),
        },
    };

    resolveParamSelectorMock.mockReturnValue({ view: betaView });

    return {
        options: {},
        getSampleView: () => sampleView,
        intentPipeline: {
            submit: vi.fn(() => Promise.resolve()),
        },
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
}

describe("agentAdapter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn();
        globalThis.window = /** @type {any} */ ({
            prompt: vi.fn(),
            __genomeSpyApp: {
                recordAgentTrace: vi.fn(),
            },
        });
    });

    it("executes resolved view-workflow requests after planner resolution", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "compute weighted mean in the selected region and add it to metadata"
        );
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "view_workflow",
                workflow: {
                    workflowType: "deriveMetadataFromSelection",
                    aggregation: "variance",
                },
            })
        );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue(
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "betaTrack",
                "beta"
            )
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit.mock.calls[0][0]).toEqual([
            expect.objectContaining({
                type: "sampleView/deriveMetadata",
                payload: expect.objectContaining({
                    name: expect.stringMatching(/^variance_beta_brush_/),
                }),
            }),
        ]);
    });

    it("asks for a grounded field when the workflow leaves the field unspecified", async () => {
        const app = createAppStub({
            x: { field: "pos", type: "locus" },
            y: { field: "beta", type: "quantitative" },
            color: { field: "segmentMean", type: "quantitative" },
        });
        globalThis.window.prompt.mockReturnValueOnce(
            "compute variance in the selected region and add it to metadata"
        );
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "view_workflow",
                workflow: {
                    workflowType: "deriveMetadataFromSelection",
                    aggregation: "variance",
                },
            })
        );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue(
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "betaTrack",
                "beta"
            )
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(showAgentChoiceDialog).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Agent Clarification",
                message: expect.stringContaining("I need to know which field"),
                choiceLabel: "Field",
                options: expect.arrayContaining([
                    expect.objectContaining({
                        value: createFieldId(
                            JSON.stringify({ scope: [], param: "brush" }),
                            "betaTrack",
                            "beta"
                        ),
                    }),
                    expect.objectContaining({
                        value: createFieldId(
                            JSON.stringify({ scope: [], param: "brush" }),
                            "betaTrack",
                            "segmentMean"
                        ),
                    }),
                ]),
                value: createFieldId(
                    JSON.stringify({ scope: [], param: "brush" }),
                    "betaTrack",
                    "beta"
                ),
            })
        );
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
    });

    it("falls back to the planner for ordinary requests", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce("sort by age");
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "answer",
                message: "Planner path used.",
            })
        );
        showMessageDialog.mockResolvedValue(true);

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
    });

    it("opens a boxplot dialog for a structured plot workflow", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "Create a boxplot from the current selection"
        );
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "view_workflow",
                workflow: {
                    workflowType: "createBoxplotFromSelection",
                    aggregation: "variance",
                },
            })
        );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue(
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "betaTrack",
                "beta"
            )
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(showHierarchyBoxplotDialog).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
    });

    it("continues locally after a grounded planner clarification instead of making a second planner request", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "Use the current selection to create derived sample metadata from a visible quantitative field using weightedMean"
        );
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "clarify",
                message:
                    "Please specify the aggregation you'd like to use for the derived sample metadata attribute.",
            })
        );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue("weightedMean");

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(showAgentChoiceDialog).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Agent Clarification",
                choiceLabel: "Aggregation",
                options: expect.arrayContaining([
                    expect.objectContaining({ value: "weightedMean" }),
                ]),
            })
        );
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
    });

    it("preserves boxplot intent when continuing locally after a grounded planner clarification", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "Create a boxplot from the active interval selection using a visible quantitative field and aggregation variance"
        );
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "clarify",
                message:
                    "Please specify the visible quantitative field you'd like to use for the boxplot.",
            })
        );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue(
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "betaTrack",
                "beta"
            )
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(showHierarchyBoxplotDialog).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
    });

    it("retries once with a view-workflow hint when the planner returns a misclassified invalid intent program", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "Compute weighted mean of the visible field in the brush and store it in sample metadata"
        );
        globalThis.fetch
            .mockResolvedValueOnce(
                createResponse({
                    type: "intent_program",
                    program: {
                        schemaVersion: 1,
                        steps: [
                            {
                                actionType: "filterByQuantitative",
                                payload: {
                                    attribute: {
                                        type: "SAMPLE_ATTRIBUTE",
                                        specifier: "signalValue",
                                    },
                                },
                            },
                        ],
                    },
                })
            )
            .mockResolvedValueOnce(
                createResponse({
                    type: "view_workflow",
                    workflow: {
                        workflowType: "deriveMetadataFromSelection",
                        aggregation: "weightedMean",
                    },
                })
            );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue(
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "betaTrack",
                "beta"
            )
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch.mock.calls[1][1].body).toContain(
            "Return a structured view_workflow for deriveMetadataFromSelection"
        );
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
        expect(showMessageDialog).not.toHaveBeenCalledWith(
            expect.stringContaining("payload.operator must be one of"),
            expect.anything()
        );
    });

    it("retries boxplot requests with a boxplot-specific view-workflow hint", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "Create a boxplot from the active interval selection using a visible quantitative field and aggregation variance"
        );
        globalThis.fetch
            .mockResolvedValueOnce(
                createResponse({
                    type: "intent_program",
                    program: {
                        schemaVersion: 1,
                        steps: [
                            {
                                actionType: "filterByQuantitative",
                                payload: {
                                    attribute: {
                                        type: "SAMPLE_ATTRIBUTE",
                                        specifier: "signalValue",
                                    },
                                },
                            },
                        ],
                    },
                })
            )
            .mockResolvedValueOnce(
                createResponse({
                    type: "view_workflow",
                    workflow: {
                        workflowType: "createBoxplotFromSelection",
                        aggregation: "variance",
                    },
                })
            );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue(
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "betaTrack",
                "beta"
            )
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch.mock.calls[1][1].body).toContain(
            "Return a structured view_workflow for createBoxplotFromSelection"
        );
        expect(showHierarchyBoxplotDialog).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
    });

    it("executes mixed agent_program steps in order", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "sort by age, group by gender and create a boxplot over the selected interval"
        );
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "agent_program",
                program: {
                    schemaVersion: 1,
                    steps: [
                        {
                            type: "intent_program",
                            program: {
                                schemaVersion: 1,
                                steps: [
                                    {
                                        actionType: "sortBy",
                                        payload: {
                                            attribute: {
                                                type: "SAMPLE_ATTRIBUTE",
                                                specifier: "age",
                                            },
                                        },
                                    },
                                    {
                                        actionType: "groupByNominal",
                                        payload: {
                                            attribute: {
                                                type: "SAMPLE_ATTRIBUTE",
                                                specifier: "gender",
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                        {
                            type: "view_workflow",
                            workflow: {
                                workflowType: "createBoxplotFromSelection",
                                aggregation: "variance",
                            },
                        },
                    ],
                },
            })
        );
        showMessageDialog.mockResolvedValue(true);
        showAgentChoiceDialog.mockResolvedValue(
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "betaTrack",
                "beta"
            )
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit.mock.calls[0][0]).toEqual([
            expect.objectContaining({ type: "sampleView/sortBy" }),
            expect.objectContaining({ type: "sampleView/groupByNominal" }),
        ]);
        expect(showHierarchyBoxplotDialog).toHaveBeenCalledTimes(1);
        expect(
            app.intentPipeline.submit.mock.invocationCallOrder[0]
        ).toBeLessThan(showHierarchyBoxplotDialog.mock.invocationCallOrder[0]);
    });
});

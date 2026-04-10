// @ts-nocheck
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
const { resolveViewSelectorMock } = vi.hoisted(() => ({
    resolveViewSelectorMock: vi.fn(),
}));
const { getViewSelectorMock } = vi.hoisted(() => ({
    getViewSelectorMock: vi.fn((view) => ({
        scope: [],
        view: view.explicitName,
    })),
}));
const { visitAddressableViewsMock } = vi.hoisted(() => ({
    visitAddressableViewsMock: vi.fn((root, visitor) => {
        root.visit(visitor);
    }),
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
    resolveViewSelector: resolveViewSelectorMock,
    getViewSelector: getViewSelectorMock,
    visitAddressableViews: visitAddressableViewsMock,
}));

vi.mock("../charts/hierarchyBoxplotDialog.js", () => ({
    __esModule: true,
    default: showHierarchyBoxplotDialog,
}));

import { createAgentAdapter } from "./agentAdapter.js";
import { createAgentSessionController } from "./agentSessionController.js";
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

function createStreamResponse(bodyText) {
    const encoder = new TextEncoder();
    let read = false;
    const streamText = bodyText.endsWith("\n\n") ? bodyText : bodyText + "\n\n";

    return {
        ok: true,
        headers: {
            get: (name) =>
                name === "content-type" ? "text/event-stream" : null,
        },
        body: {
            getReader: () => ({
                read: async () => {
                    if (read) {
                        return { done: true, value: undefined };
                    }

                    read = true;
                    return { done: false, value: encoder.encode(streamText) };
                },
            }),
        },
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
        store: {
            dispatch: vi.fn(),
        },
        getSampleView: () => sampleView,
        genomeSpy: {
            viewRoot: {
                explicitName: "root",
            },
        },
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

/**
 * @returns {Record<string, any>}
 */
function createControllerRuntimeMock() {
    return {
        requestPlan: vi.fn(),
        validateIntentProgram: vi.fn(),
        submitIntentProgram: vi.fn(),
        resolveViewSelector: vi.fn(() => ({})),
        setViewVisibility: vi.fn(),
        clearViewVisibility: vi.fn(),
        summarizeExecutionResult: vi.fn(),
        summarizeIntentProgram: vi.fn(),
    };
}

/**
 * @returns {Record<string, any>}
 */
function createMockPlannerContext() {
    return {
        schemaVersion: 1,
        sampleSummary: {
            sampleCount: 61,
            groupCount: 1,
        },
        viewRoot: {
            type: "vconcat",
            title: "viewRoot",
            description: "Functional Segmentation (FUSE) of ENCODE WGBS data",
            children: [
                {
                    type: "layer",
                    title: "Data Tracks",
                    children: [],
                },
            ],
        },
        attributes: [
            {
                title: "Age",
            },
            {
                title: "Diagnosis",
            },
        ],
        actionCatalog: [],
        viewWorkflows: {
            workflows: [],
        },
        provenance: [],
        lifecycle: {
            appInitialized: true,
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

    it("dispatches view visibility tools directly to the store", () => {
        const app = createAppStub();
        resolveViewSelectorMock.mockReturnValue({
            explicitName: "collapsed-track",
        });

        const adapter = createAgentAdapter(app);
        adapter.setViewVisibility(
            {
                scope: [],
                view: "collapsed-track",
            },
            false
        );
        adapter.clearViewVisibility({
            scope: [],
            view: "collapsed-track",
        });

        expect(app.store.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "viewSettings/setVisibility",
            })
        );
        expect(app.store.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "viewSettings/restoreDefaultVisibility",
            })
        );
    });

    it("uses the agent session controller expansion state for agent context snapshots", () => {
        const app = createAppStub();
        app.agentSessionController = {
            getSnapshot: () => ({
                expandedViewNodeKeys: [
                    JSON.stringify({ scope: [], view: "reference-sequence" }),
                ],
            }),
        };
        getAgentContext.mockReturnValue(createMockPlannerContext());

        const adapter = createAgentAdapter(app);
        adapter.getAgentContext();

        expect(getAgentContext).toHaveBeenCalledWith(
            app,
            expect.objectContaining({
                expandedViewNodeKeys: [
                    JSON.stringify({ scope: [], view: "reference-sequence" }),
                ],
            })
        );
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

    it("posts structured conversation history to the planner endpoint", async () => {
        const app = createAppStub();
        const adapter = createAgentAdapter(app);
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "answer",
                message: "OK",
            })
        );

        const history = [
            {
                id: "msg_001",
                role: "user",
                text: "What is in this visualization?",
            },
            {
                id: "msg_002",
                role: "assistant",
                text: "It is a cohort view.",
            },
            {
                id: "msg_003",
                role: "assistant",
                text: "Do you want the structure or the encodings?",
                kind: "clarification",
            },
        ];

        await adapter.requestPlan(
            "How are methylation levels encoded?",
            history
        );

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch.mock.calls[0][1].body).toContain(
            '"message":"How are methylation levels encoded?"'
        );
        expect(globalThis.fetch.mock.calls[0][1].body).toContain(
            '"history":[{"id":"msg_001","role":"user","text":"What is in this visualization?"},{"id":"msg_002","role":"assistant","text":"It is a cohort view."},{"id":"msg_003","role":"assistant","text":"Do you want the structure or the encodings?","kind":"clarification"}]'
        );
    });

    it("consumes streamed planner events when callbacks are provided", async () => {
        const app = createAppStub();
        globalThis.fetch.mockResolvedValueOnce(
            createStreamResponse(
                [
                    "event: start",
                    'data: {"status":"working"}',
                    "",
                    "event: delta",
                    'data: {"delta":"This view summarizes the cohort."}',
                    "",
                    "event: reasoning_delta",
                    'data: {"delta":"Checking the response shape."}',
                    "",
                    "event: final",
                    'data: {"response":{"type":"answer","message":"This view summarizes the cohort."},"trace":{"totalMs":21}}',
                    "",
                ].join("\n")
            )
        );

        const onDelta = vi.fn();
        const onReasoning = vi.fn();
        const onHeartbeat = vi.fn();

        const adapter = createAgentAdapter(app);
        const result = await adapter.requestPlan("What can I do here?", [], {
            onDelta,
            onReasoning,
            onHeartbeat,
        });

        expect(onDelta).toHaveBeenCalledWith(
            "This view summarizes the cohort."
        );
        expect(onReasoning).toHaveBeenCalledWith(
            "Checking the response shape."
        );
        expect(onHeartbeat).not.toHaveBeenCalled();
        expect(result.response).toEqual({
            type: "answer",
            message: "This view summarizes the cohort.",
        });
        expect(globalThis.fetch.mock.calls[0][0]).toBe(
            "http://127.0.0.1:8000/v1/plan"
        );
        expect(globalThis.fetch.mock.calls[0][1].headers.accept).toBe(
            "text/event-stream"
        );
    });

    it("uses the dev-only mock planner when the base URL is mock", async () => {
        const app = createAppStub();
        app.options.agentBaseUrl = "mock";
        getAgentContext.mockReturnValue(createMockPlannerContext());
        const adapter = createAgentAdapter(app);

        const result = await adapter.requestPlan(
            "What is in this visualization?",
            []
        );

        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(result.response).toEqual(
            expect.objectContaining({
                type: "answer",
            })
        );
        expect(result.response.message).toContain(
            "Functional Segmentation (FUSE) of ENCODE WGBS data"
        );
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

    it("stops promptly when the same rejected tool call repeats", async () => {
        const app = createAppStub();
        app.agentSessionController = createAgentSessionController(
            createControllerRuntimeMock()
        );
        globalThis.window.prompt.mockReturnValueOnce(
            "I cannot see the reference sequence in the visualization."
        );
        globalThis.fetch
            .mockResolvedValueOnce(
                createResponse({
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: "call-1",
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true",
                            },
                        },
                    ],
                })
            )
            .mockResolvedValueOnce(
                createResponse({
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: "call-2",
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true",
                            },
                        },
                    ],
                })
            );
        showMessageDialog.mockResolvedValue(true);

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        const retryRequest = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
        expect(retryRequest.history[1].text).toContain(
            "Tool call was incorrect and rejected. Correct it before trying again."
        );
        expect(retryRequest.history[1].text).toContain(
            "setViewVisibility expects selector (ViewSelector), visibility (boolean)."
        );
        expect(retryRequest.history[1].text).toContain('"visibility": false');
        expect(showMessageDialog).toHaveBeenCalledWith(
            expect.stringContaining(
                "Error: Agent repeated the same rejected tool call after validation failure."
            ),
            expect.objectContaining({
                title: "Local Agent Error",
                type: "error",
            })
        );
    });

    it("allows several varied rejected tool calls before stopping on budget", async () => {
        const app = createAppStub();
        app.agentSessionController = createAgentSessionController(
            createControllerRuntimeMock()
        );
        globalThis.window.prompt.mockReturnValueOnce(
            "I cannot see the reference sequence in the visualization."
        );
        globalThis.fetch
            .mockResolvedValueOnce(
                createResponse({
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: "call-1",
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true-1",
                            },
                        },
                    ],
                })
            )
            .mockResolvedValueOnce(
                createResponse({
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: "call-2",
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true-2",
                            },
                        },
                    ],
                })
            )
            .mockResolvedValueOnce(
                createResponse({
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: "call-3",
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true-3",
                            },
                        },
                    ],
                })
            )
            .mockResolvedValueOnce(
                createResponse({
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: "call-4",
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true-4",
                            },
                        },
                    ],
                })
            )
            .mockResolvedValueOnce(
                createResponse({
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: "call-5",
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true-5",
                            },
                        },
                    ],
                })
            );
        showMessageDialog.mockResolvedValue(true);

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(5);
        expect(showMessageDialog).toHaveBeenCalledWith(
            expect.stringContaining(
                "Error: Agent produced too many rejected tool calls without converging."
            ),
            expect.objectContaining({
                title: "Local Agent Error",
                type: "error",
            })
        );
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
                                actionType: "sampleView/filterByQuantitative",
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
                                actionType: "sampleView/filterByQuantitative",
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
                                        actionType: "sampleView/sortBy",
                                        payload: {
                                            attribute: {
                                                type: "SAMPLE_ATTRIBUTE",
                                                specifier: "age",
                                            },
                                        },
                                    },
                                    {
                                        actionType: "sampleView/groupByNominal",
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

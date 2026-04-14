// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAgentContext } = vi.hoisted(() => ({
    getAgentContext: vi.fn(() => ({ schemaVersion: 1 })),
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

vi.mock("./contextBuilder.js", () => ({
    getAgentContext,
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    resolveParamSelector: resolveParamSelectorMock,
    resolveViewSelector: resolveViewSelectorMock,
    getViewSelector: getViewSelectorMock,
    makeParamSelectorKey: (selector) => JSON.stringify(selector),
    visitAddressableViews: visitAddressableViewsMock,
}));

import { createAgentAdapter } from "./agentAdapter.js";
import { createAgentSessionController } from "./agentSessionController.js";

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
            getActionHistory: () => [],
            getActionInfo: () => undefined,
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
        getAgentContext: vi.fn(() => ({
            selectionAggregation: {
                fields: [],
            },
        })),
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
            visibleSampleCount: 61,
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
        selectionAggregation: {
            fields: [],
        },
        provenance: [],
        lifecycle: {
            appInitialized: true,
        },
    };
}

describe("agentAdapter", () => {
    /** @type {ReturnType<typeof vi.spyOn> | undefined} */
    let consoleLogSpy;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
        expect(consoleLogSpy).toHaveBeenCalledWith(
            "[GenomeSpy Agent] Suppressed dialog: Local Agent Error",
            expect.stringContaining(
                "Error: Agent repeated the same rejected tool call after validation failure."
            )
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

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(5);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            "[GenomeSpy Agent] Suppressed dialog: Local Agent Error",
            expect.stringContaining(
                "Error: Agent produced too many rejected tool calls without converging."
            )
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

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(
            "[GenomeSpy Agent] Suppressed dialog: Agent Response",
            "Planner path used."
        );
    });

    it("suppresses agent_program execution when confirmation dialogs are disabled", async () => {
        const app = createAppStub();
        globalThis.window.prompt.mockReturnValueOnce(
            "sort by age, group by gender and derive metadata from the selected interval"
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
                            type: "intent_program",
                            program: {
                                schemaVersion: 1,
                                steps: [
                                    {
                                        actionType: "sampleView/deriveMetadata",
                                        payload: {
                                            attribute: {
                                                type: "VALUE_AT_LOCUS",
                                                specifier: {
                                                    view: {
                                                        scope: [],
                                                        view: "betaTrack",
                                                    },
                                                    field: "beta",
                                                    interval: {
                                                        type: "selection",
                                                        selector: {
                                                            scope: [],
                                                            param: "brush",
                                                        },
                                                    },
                                                    aggregation: {
                                                        op: "variance",
                                                    },
                                                },
                                            },
                                            name: "variance_beta_brush",
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            })
        );

        const adapter = createAgentAdapter(app);
        await adapter.runLocalPrompt();

        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(
            "[GenomeSpy Agent] Suppressed dialog: Execute Local Agent Plan?",
            expect.stringContaining("Sort by age")
        );
    });
});

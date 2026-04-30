import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentSessionController } from "./agentSessionController.js";

const PREFLIGHT_MESSAGE = 'Preflight check: answer with just "I\'m here".';

/**
 * @returns {{
 *     requestAgentTurn: ReturnType<typeof vi.fn>;
 *     submitIntentActions: ReturnType<typeof vi.fn>;
 *     getAgentContext: ReturnType<typeof vi.fn>;
 *     getAgentVolatileContext: ReturnType<typeof vi.fn>;
 *     agentApi: {
 *         resolveViewSelector: ReturnType<typeof vi.fn>;
 *         setViewVisibility: ReturnType<typeof vi.fn>;
 *         jumpToProvenanceState: ReturnType<typeof vi.fn>;
 *         jumpToInitialProvenanceState: ReturnType<typeof vi.fn>;
 *         buildSampleAttributePlot: ReturnType<typeof vi.fn>;
 *     };
 *     resolveViewSelector: ReturnType<typeof vi.fn>;
 *     setViewVisibility: ReturnType<typeof vi.fn>;
 *     summarizeExecutionResult: ReturnType<typeof vi.fn>;
 *     summarizeProvenanceActionsSince: ReturnType<typeof vi.fn>;
 * }}
 */
function createRuntimeMock() {
    const agentApi = {
        resolveViewSelector: vi.fn(() => ({
            isVisible: vi.fn(() => true),
        })),
        setViewVisibility: vi.fn(),
        getActionHistory: vi.fn(() => [
            {
                provenanceId: "provenance-1",
                summary: "Sort by purity.",
                type: "sampleView/sortBy",
            },
        ]),
        jumpToProvenanceState: vi.fn(),
        jumpToInitialProvenanceState: vi.fn(),
        getSampleHierarchy: vi.fn(() => ({
            groupMetadata: [],
        })),
        buildSampleAttributePlot: vi.fn(() => ({
            kind: "sample_attribute_plot",
            plotType: "scatterplot",
            title: "Scatterplot of age vs purity",
            spec: {},
            namedData: [],
            filename: "genomespy-scatterplot.png",
            summary: {
                groupCount: 2,
                rowCount: 12,
            },
        })),
    };

    return {
        requestAgentTurn: vi.fn(),
        submitIntentActions: vi.fn(),
        getAgentContext: vi.fn(() => ({})),
        getAgentVolatileContext: vi.fn(() => ({
            selectionAggregation: {
                fields: [],
            },
        })),
        agentApi,
        resolveViewSelector: agentApi.resolveViewSelector,
        setViewVisibility: agentApi.setViewVisibility,
        summarizeExecutionResult: vi.fn(),
        summarizeProvenanceActionsSince: vi.fn(() => []),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("createAgentSessionController", () => {
    it("tracks expanded view nodes in the session snapshot", () => {
        const runtime = createRuntimeMock();
        const controller = createAgentSessionController(runtime);

        controller.expandViewNode({
            scope: [],
            view: "annotation-track",
        });

        expect(controller.getSnapshot().expandedViewNodeKeys).toEqual([
            'v:{"scope":[],"view":"annotation-track"}',
        ]);

        controller.collapseViewNode({
            scope: [],
            view: "annotation-track",
        });

        expect(controller.getSnapshot().expandedViewNodeKeys).toEqual([]);
    });

    it("summarizes provenance changes after submitIntentActions tool calls", async () => {
        const runtime = createRuntimeMock();
        const provenanceHistory = [];
        let agentTurnCallCount = 0;
        const observedHistories = [];
        runtime.summarizeProvenanceActionsSince.mockImplementation(
            (startIndex) =>
                provenanceHistory.slice(startIndex).map((action) => ({
                    content: action.summary,
                    text: action.summary,
                }))
        );
        runtime.submitIntentActions.mockImplementation(async (batch) => {
            const provenanceIds = [];
            for (const step of batch.steps) {
                const provenanceId =
                    "provenance-" + (provenanceHistory.length + 1);
                provenanceIds.push(provenanceId);
                provenanceHistory.push({
                    summary:
                        step.actionType === "sampleView/sortBy"
                            ? "Sort by age"
                            : step.actionType,
                    provenanceId,
                    type: step.actionType,
                    payload: step.payload,
                });
            }

            return {
                ok: true,
                executedActions: batch.steps.length,
                content: {
                    kind: "intent_batch_result",
                    batch,
                    provenanceIds,
                },
                summaries: [
                    {
                        content: "ignored",
                        text: "ignored",
                    },
                ],
                batch,
            };
        });
        runtime.summarizeExecutionResult.mockReturnValue(
            "Executed 1 action.\n- ignored"
        );
        runtime.requestAgentTurn.mockImplementation(
            (message, history, stream, allowStreaming, contextOptions) => {
                agentTurnCallCount += 1;
                observedHistories.push(history);
                if (message === PREFLIGHT_MESSAGE) {
                    return Promise.resolve({
                        response: {
                            type: "answer",
                            message: "I'm here",
                        },
                        trace: {
                            totalMs: 10,
                        },
                    });
                }

                if (agentTurnCallCount === 2) {
                    return Promise.resolve({
                        response: {
                            type: "tool_call",
                            message: "I will sort the samples by age.",
                            toolCalls: [
                                {
                                    callId: "call-1",
                                    name: "submitIntentActions",
                                    arguments: {
                                        actions: [
                                            {
                                                actionType: "sampleView/sortBy",
                                                payload: {
                                                    attribute: {
                                                        type: "SAMPLE_ATTRIBUTE",
                                                        specifier: "age",
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                        trace: {
                            totalMs: 11,
                        },
                    });
                }
                expect(contextOptions.expandedViewNodeKeys).toEqual([]);

                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "Sorted the samples by age.",
                    },
                    trace: {
                        totalMs: 12,
                    },
                });
            }
        );

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("Sort the samples by age.");

        const snapshot = controller.getSnapshot();
        expect(snapshot.messages).toHaveLength(5);
        expect(snapshot.messages[1]).toMatchObject({
            kind: "tool_call",
            text: "I will sort the samples by age.",
        });
        expect(snapshot.messages[2]).toMatchObject({
            kind: "tool_result",
            text: "Executed 1 action.\n- ignored",
        });
        expect(snapshot.messages[3]).toMatchObject({
            kind: "result",
            text: "Completed 1 action.",
            lines: [
                {
                    content: "Sort by age",
                    text: "Sort by age",
                },
            ],
        });
        expect(snapshot.messages[4]).toMatchObject({
            kind: "assistant",
            text: "Sorted the samples by age.",
        });
        expect(observedHistories).toEqual([
            [],
            [],
            [
                {
                    id: "2",
                    role: "assistant",
                    text: "I will sort the samples by age.",
                    phase: "commentary",
                    kind: "tool_call",
                    toolCalls: [
                        {
                            callId: "call-1",
                            name: "submitIntentActions",
                            arguments: {
                                actions: [
                                    {
                                        actionType: "sampleView/sortBy",
                                        payload: {
                                            attribute: {
                                                type: "SAMPLE_ATTRIBUTE",
                                                specifier: "age",
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                {
                    id: "3",
                    role: "tool",
                    text: "Executed 1 action.\n- ignored",
                    kind: "tool_result",
                    toolCallId: "call-1",
                    content: {
                        kind: "intent_batch_result",
                        batch: {
                            schemaVersion: 1,
                            rationale: undefined,
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
                            ],
                        },
                        provenanceIds: ["provenance-1"],
                    },
                },
            ],
        ]);
        expect(runtime.summarizeProvenanceActionsSince).toHaveBeenCalledWith(0);
    });

    it("parses numbered clarification choices from the agent response", async () => {
        const runtime = createRuntimeMock();
        runtime.requestAgentTurn.mockImplementation((message) => {
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "I'm here",
                    },
                    trace: {
                        totalMs: 10,
                    },
                });
            }

            return Promise.resolve({
                response: {
                    type: "clarify",
                    message:
                        "Which part should I focus on?\n\n1. Visualization structure\n2. Encodings\n3. Available attributes",
                },
                trace: {
                    totalMs: 14,
                },
            });
        });

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("What should I look at?");

        const snapshot = controller.getSnapshot();
        expect(snapshot.status).toBe("clarification");
        expect(snapshot.messages).toHaveLength(2);
        expect(snapshot.messages[1]).toMatchObject({
            kind: "clarification",
            text: "Which part should I focus on?",
            options: [
                {
                    value: "Visualization structure",
                    label: "Visualization structure",
                },
                {
                    value: "Encodings",
                    label: "Encodings",
                },
                {
                    value: "Available attributes",
                    label: "Available attributes",
                },
            ],
        });
    });

    it("executes agent tool calls and re-runs with the expanded view context", async () => {
        const runtime = createRuntimeMock();
        let agentTurnCallCount = 0;
        const observedHistories = [];
        runtime.requestAgentTurn.mockImplementation(
            (message, history, stream, allowStreaming, contextOptions) => {
                agentTurnCallCount += 1;
                observedHistories.push(history);
                if (message === PREFLIGHT_MESSAGE) {
                    return Promise.resolve({
                        response: {
                            type: "answer",
                            message: "I'm here",
                        },
                        trace: {
                            totalMs: 10,
                        },
                    });
                }

                if (agentTurnCallCount === 2) {
                    stream.onDelta?.("I should open the collapsed track.");
                    return Promise.resolve({
                        response: {
                            type: "tool_call",
                            message: "I should open the collapsed track.",
                            toolCalls: [
                                {
                                    callId: "call-1",
                                    name: "expandViewNode",
                                    arguments: {
                                        selector: {
                                            scope: [],
                                            view: "collapsed-track",
                                        },
                                    },
                                },
                            ],
                        },
                        trace: {
                            totalMs: 11,
                        },
                    });
                }

                expect(contextOptions.expandedViewNodeKeys).toEqual([
                    'v:{"scope":[],"view":"collapsed-track"}',
                ]);

                return Promise.resolve({
                    response: {
                        type: "answer",
                        message:
                            "The collapsed track is a heatmap of copy number changes.",
                    },
                    trace: {
                        totalMs: 12,
                    },
                });
            }
        );

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage(
            "What is hidden under that collapsed track?"
        );

        expect(controller.getSnapshot().expandedViewNodeKeys).toEqual([
            'v:{"scope":[],"view":"collapsed-track"}',
        ]);
        expect(runtime.requestAgentTurn).toHaveBeenCalledTimes(3);
        expect(observedHistories[2]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: "tool_call",
                    phase: "commentary",
                }),
            ])
        );
        expect(controller.getSnapshot().messages).toHaveLength(4);
        expect(controller.getSnapshot().messages[1]).toMatchObject({
            kind: "tool_call",
            text: "I should open the collapsed track.",
        });
        expect(controller.getSnapshot().messages[2]).toMatchObject({
            kind: "tool_result",
            text: "Expanded the requested view branch.",
            content: {
                kind: "view_state_change",
                domain: "agent_context",
                field: "collapsed",
                selector: {
                    scope: [],
                    view: "collapsed-track",
                },
                before: false,
                after: true,
                changed: true,
            },
        });
        expect(controller.getSnapshot().messages[3]).toMatchObject({
            kind: "assistant",
            text: "The collapsed track is a heatmap of copy number changes.",
        });
    });

    it("renders sample attribute plots without adding them to model history", async () => {
        const runtime = createRuntimeMock();
        let agentTurnCallCount = 0;
        const observedHistories = [];
        runtime.requestAgentTurn.mockImplementation(
            (message, history, stream, allowStreaming, contextOptions) => {
                agentTurnCallCount += 1;
                observedHistories.push(history);

                if (message === PREFLIGHT_MESSAGE) {
                    return Promise.resolve({
                        response: {
                            type: "answer",
                            message: "I'm here",
                        },
                        trace: {
                            totalMs: 10,
                        },
                    });
                }

                if (agentTurnCallCount === 2) {
                    return Promise.resolve({
                        response: {
                            type: "tool_call",
                            message: "I will show a scatterplot.",
                            toolCalls: [
                                {
                                    callId: "call-plot",
                                    name: "showSampleAttributePlot",
                                    arguments: {
                                        plot: {
                                            kind: "quantitativeRelationship",
                                            attributes: [
                                                {
                                                    type: "SAMPLE_ATTRIBUTE",
                                                    specifier: "age",
                                                },
                                                {
                                                    type: "SAMPLE_ATTRIBUTE",
                                                    specifier: "purity",
                                                },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                        trace: {
                            totalMs: 11,
                        },
                    });
                }

                expect(contextOptions.expandedViewNodeKeys).toEqual([]);

                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "Here is the scatterplot.",
                    },
                    trace: {
                        totalMs: 12,
                    },
                });
            }
        );

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("Show me age versus purity.");

        const snapshot = controller.getSnapshot();
        expect(snapshot.messages).toHaveLength(5);
        expect(snapshot.messages[1]).toMatchObject({
            kind: "tool_call",
            text: "I will show a scatterplot.",
        });
        expect(snapshot.messages[2]).toMatchObject({
            kind: "tool_result",
            text: "Generated Scatterplot of age vs purity with 2 groups and 12 rows.",
        });
        expect(snapshot.messages[3]).toMatchObject({
            kind: "plot",
            text: "Generated Scatterplot of age vs purity with 2 groups and 12 rows.",
            content: expect.objectContaining({
                kind: "sample_attribute_plot",
                plotType: "scatterplot",
                title: "Scatterplot of age vs purity",
            }),
        });
        expect(snapshot.messages[4]).toMatchObject({
            kind: "assistant",
            text: "Here is the scatterplot.",
        });
        expect(observedHistories[2]).toEqual([
            {
                id: "2",
                role: "assistant",
                text: "I will show a scatterplot.",
                phase: "commentary",
                kind: "tool_call",
                toolCalls: [
                    {
                        callId: "call-plot",
                        name: "showSampleAttributePlot",
                        arguments: {
                            plot: {
                                kind: "quantitativeRelationship",
                                attributes: [
                                    {
                                        type: "SAMPLE_ATTRIBUTE",
                                        specifier: "age",
                                    },
                                    {
                                        type: "SAMPLE_ATTRIBUTE",
                                        specifier: "purity",
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
            {
                id: "3",
                role: "tool",
                text: "Generated Scatterplot of age vs purity with 2 groups and 12 rows.",
                kind: "tool_result",
                toolCallId: "call-plot",
                content: undefined,
            },
        ]);
    });

    it("requires a new turn after information tools before dependent calls", async () => {
        const runtime = createRuntimeMock();
        const controller = createAgentSessionController(runtime);

        const results = await controller.executeToolCalls([
            {
                callId: "call-details",
                name: "getIntentActionDocs",
                arguments: {
                    actionType: "sampleView/groupByNominal",
                    includeSchema: false,
                },
            },
            {
                callId: "call-plot",
                name: "showSampleAttributePlot",
                arguments: {
                    plot: {
                        kind: "valueDistributionByCurrentGroups",
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "mutations",
                        },
                    },
                },
            },
        ]);

        expect(results).toMatchObject([
            {
                toolCallId: "call-details",
                rejected: false,
            },
            {
                toolCallId: "call-plot",
                rejected: true,
                text: expect.stringContaining(
                    "Tool results are only available after the batch completes."
                ),
            },
        ]);
        expect(
            runtime.agentApi.buildSampleAttributePlot
        ).not.toHaveBeenCalled();
    });

    it("summarizes intent batch tool results for sample-view actions", async () => {
        const runtime = createRuntimeMock();
        runtime.submitIntentActions.mockResolvedValue({
            ok: true,
            executedActions: 2,
            content: {
                kind: "intent_batch_result",
                sampleView: {
                    visibleSamplesBefore: 2,
                    visibleSamplesAfter: 2,
                    groupLevelsBefore: 1,
                    groupLevelsAfter: 1,
                },
            },
            summaries: [
                { content: "Sort by age", text: "Sort by age" },
                { content: "Group by diagnosis", text: "Group by diagnosis" },
                {
                    content: "Visible samples before: 2",
                    text: "Visible samples before: 2",
                },
                {
                    content: "Visible samples after: 2",
                    text: "Visible samples after: 2",
                },
                {
                    content: "Group levels before: 1",
                    text: "Group levels before: 1",
                },
                {
                    content: "Group levels after: 1",
                    text: "Group levels after: 1",
                },
            ],
            batch: {
                schemaVersion: 1,
                rationale: undefined,
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
                                specifier: "diagnosis",
                            },
                        },
                    },
                ],
            },
        });
        runtime.summarizeExecutionResult.mockReturnValue(
            "Executed 2 actions.\n- Sort by age\n- Group by diagnosis\n- Visible samples before: 2\n- Visible samples after: 2\n- Group levels before: 1\n- Group levels after: 1"
        );

        const controller = createAgentSessionController(runtime);
        const results = await controller.executeToolCalls([
            {
                callId: "call-intent",
                name: "submitIntentActions",
                arguments: {
                    actions: [
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
                                    specifier: "diagnosis",
                                },
                            },
                        },
                    ],
                },
            },
        ]);

        expect(runtime.submitIntentActions).toHaveBeenCalledTimes(1);
        expect(results[0]).toEqual(
            expect.objectContaining({
                rejected: false,
                text: "Executed 2 actions.\n- Sort by age\n- Group by diagnosis\n- Visible samples before: 2\n- Visible samples after: 2\n- Group levels before: 1\n- Group levels after: 1",
                content: expect.objectContaining({
                    kind: "intent_batch_result",
                    sampleView: expect.objectContaining({
                        visibleSamplesAfter: 2,
                    }),
                }),
            })
        );
    });

    it("returns an intent batch failure to the agent as a rejected tool result", async () => {
        const runtime = createRuntimeMock();
        let returnedToolCall = false;
        runtime.submitIntentActions.mockRejectedValue(
            new Error("No such attribute: mean beta")
        );
        runtime.requestAgentTurn.mockImplementation(
            (message, history, stream, allowStreaming, contextOptions) => {
                if (message === PREFLIGHT_MESSAGE) {
                    return Promise.resolve({
                        response: {
                            type: "answer",
                            message: "I'm here",
                        },
                        trace: {
                            totalMs: 10,
                        },
                    });
                }

                if (!returnedToolCall) {
                    returnedToolCall = true;
                    return Promise.resolve({
                        response: {
                            type: "tool_call",
                            message: "I will add mean beta to metadata.",
                            toolCalls: [
                                {
                                    callId: "call-intent",
                                    name: "submitIntentActions",
                                    arguments: {
                                        actions: [
                                            {
                                                actionType: "sampleView/sortBy",
                                                payload: {
                                                    attribute: {
                                                        type: "SAMPLE_ATTRIBUTE",
                                                        specifier: "age",
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                        trace: {
                            totalMs: 11,
                        },
                    });
                }

                expect(contextOptions.expandedViewNodeKeys).toEqual([]);

                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "Use a different attribute.",
                    },
                    trace: {
                        totalMs: 12,
                    },
                });
            }
        );

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("Add mean beta to metadata.");

        expect(runtime.submitIntentActions).toHaveBeenCalledTimes(1);
        expect(controller.getSnapshot().messages).toHaveLength(4);
        expect(controller.getSnapshot().messages[2]).toEqual(
            expect.objectContaining({
                kind: "tool_result",
                toolCallId: "call-intent",
            })
        );
        expect(controller.getSnapshot().messages[3]).toMatchObject({
            kind: "assistant",
            text: "Use a different attribute.",
        });
    });

    it("returns a structured no-op result when collapsing an already collapsed branch", async () => {
        const runtime = createRuntimeMock();
        const controller = createAgentSessionController(runtime);

        const results = await controller.executeToolCalls([
            {
                callId: "call-collapse",
                name: "collapseViewNode",
                arguments: {
                    selector: {
                        scope: [],
                        view: "reference-sequence",
                    },
                },
            },
        ]);

        expect(results).toEqual([
            expect.objectContaining({
                rejected: false,
                text: "The requested view branch was already collapsed.",
                content: {
                    kind: "view_state_change",
                    domain: "agent_context",
                    field: "collapsed",
                    selector: {
                        scope: [],
                        view: "reference-sequence",
                    },
                    before: false,
                    after: false,
                    changed: false,
                },
            }),
        ]);
    });

    it("resolves a selection aggregation candidate into the canonical attribute", async () => {
        const runtime = createRuntimeMock();
        runtime.getAgentVolatileContext.mockReturnValue({
            selectionAggregation: {
                fields: [
                    {
                        candidateId: "brush@track:beta",
                        view: "track",
                        viewSelector: {
                            scope: [],
                            view: "track",
                        },
                        field: "beta",
                        dataType: "quantitative",
                        selectionSelector: {
                            scope: [],
                            param: "brush",
                        },
                        supportedAggregations: [
                            "count",
                            "min",
                            "max",
                            "weightedMean",
                            "variance",
                        ],
                    },
                ],
            },
        });

        const controller = createAgentSessionController(runtime);
        const results = await controller.executeToolCalls([
            {
                callId: "call-resolve",
                name: "buildSelectionAggregationAttribute",
                arguments: {
                    candidateId: "brush@track:beta",
                    aggregation: "max",
                },
            },
        ]);

        expect(runtime.getAgentVolatileContext).toHaveBeenCalledTimes(1);
        expect(results).toEqual([
            expect.objectContaining({
                rejected: false,
                text: "Built an AttributeIdentifier for max(beta) from brush@track:beta. No aggregated value was computed. Use content.attribute as payload.attribute in the next `submitIntentActions` call. If you need a different locus or interval, update the selection first.",
                content: expect.objectContaining({
                    kind: "selection_aggregation_resolution",
                    candidateId: "brush@track:beta",
                    aggregation: "max",
                    field: "beta",
                    title: "max(beta)",
                    description:
                        "Aggregated beta values over the brush selection",
                    attribute: expect.objectContaining({
                        type: "VALUE_AT_LOCUS",
                        specifier: expect.objectContaining({
                            view: {
                                scope: [],
                                view: "track",
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
                                op: "max",
                            },
                        }),
                    }),
                }),
            }),
        ]);
    });

    it("queues input during preflight and drains it after preflight succeeds", async () => {
        /** @type {(value: any) => void} */
        let resolvePreflight;
        const runtime = createRuntimeMock();
        runtime.requestAgentTurn.mockImplementation((message) => {
            if (message === PREFLIGHT_MESSAGE) {
                return new Promise((resolve) => {
                    resolvePreflight = resolve;
                });
            }

            return Promise.resolve({
                response: {
                    type: "answer",
                    message: "Done",
                },
                trace: {
                    totalMs: 18,
                },
            });
        });

        runtime.submitIntentActions.mockResolvedValue({
            ok: true,
            executedActions: 0,
            summaries: [],
            batch: {
                schemaVersion: 1,
                rationale: undefined,
                steps: [],
            },
        });
        runtime.summarizeExecutionResult.mockReturnValue("Executed 0 actions.");

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        void controller.open();
        await Promise.resolve();

        void controller.sendMessage("Show me the current view.");
        expect(controller.getSnapshot().queuedMessageCount).toBe(1);
        expect(runtime.requestAgentTurn).toHaveBeenCalledTimes(1);
        expect(runtime.requestAgentTurn.mock.calls[0][0]).toBe(
            PREFLIGHT_MESSAGE
        );
        expect(runtime.requestAgentTurn.mock.calls[0][3]).toBe(false);

        resolvePreflight({
            response: {
                type: "answer",
                message: "I'm here",
            },
            trace: {
                totalMs: 12,
            },
        });

        await Promise.resolve();
        await Promise.resolve();

        const snapshot = controller.getSnapshot();
        expect(snapshot.preflightState).toBe("ready");
        expect(snapshot.queuedMessageCount).toBe(0);
        expect(snapshot.messages).toHaveLength(2);
        expect(snapshot.messages[0]).toMatchObject({
            kind: "user",
            text: "Show me the current view.",
        });
        expect(snapshot.messages[1]).toMatchObject({
            kind: "assistant",
            text: "Done",
        });
        expect(runtime.requestAgentTurn).toHaveBeenCalledTimes(2);
        expect(runtime.requestAgentTurn.mock.calls[1][0]).toBe(
            "Show me the current view."
        );
    });

    it("marks completed assistant answers as final answer history", async () => {
        const runtime = createRuntimeMock();
        const observedHistories = [];
        runtime.requestAgentTurn.mockImplementation((message, history) => {
            observedHistories.push(history);
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "I'm here",
                    },
                    trace: {
                        totalMs: 10,
                    },
                });
            }

            return Promise.resolve({
                response: {
                    type: "answer",
                    message: "The x axis uses genomic coordinates.",
                },
                trace: {
                    totalMs: 11,
                },
            });
        });

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("What is on the x axis?");
        await controller.sendMessage("What about the y axis?");

        expect(observedHistories[2]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: "assistant",
                    phase: "final_answer",
                }),
            ])
        );
    });

    it("keeps message object identity stable across snapshot reads", async () => {
        const runtime = createRuntimeMock();
        runtime.requestAgentTurn.mockImplementation((message) => {
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "I'm here",
                    },
                    trace: {
                        totalMs: 12,
                    },
                });
            }

            return Promise.resolve({
                response: {
                    type: "answer",
                    message: "Done",
                },
                trace: {
                    totalMs: 12,
                },
            });
        });

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("Show me the current view.");

        const firstSnapshot = controller.getSnapshot();
        const secondSnapshot = controller.getSnapshot();

        expect(firstSnapshot.messages).toHaveLength(2);
        expect(secondSnapshot.messages[0]).toBe(firstSnapshot.messages[0]);
        expect(secondSnapshot.messages[1]).toBe(firstSnapshot.messages[1]);
    });

    it("publishes active-turn stream updates before the final response", async () => {
        const runtime = createRuntimeMock();
        runtime.requestAgentTurn.mockImplementation(
            (message, history, stream) => {
                if (message === PREFLIGHT_MESSAGE) {
                    return Promise.resolve({
                        response: {
                            type: "answer",
                            message: "I'm here",
                        },
                        trace: {
                            totalMs: 10,
                        },
                    });
                }

                stream.onHeartbeat?.();
                stream.onReasoning?.("Checking the response shape.");
                stream.onDelta?.("This view summarizes the cohort.");

                return Promise.resolve({
                    response: {
                        type: "answer",
                        message:
                            "This view summarizes the cohort. Try asking for a sort or filter to turn it into an action.",
                    },
                    trace: {
                        totalMs: 22,
                    },
                });
            }
        );

        const activeSnapshots = [];
        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});
        controller.subscribeToActiveTurn((snapshot) => {
            activeSnapshots.push(
                snapshot
                    ? {
                          ...snapshot,
                      }
                    : null
            );
        });

        await controller.open();
        await controller.sendMessage("What can I do here?");

        expect(activeSnapshots.some((snapshot) => snapshot === null)).toBe(
            true
        );
        expect(
            activeSnapshots.some(
                (snapshot) =>
                    snapshot?.status === "working" ||
                    snapshot?.status === "streaming"
            )
        ).toBe(true);
        expect(
            activeSnapshots.some(
                (snapshot) =>
                    snapshot?.draftText === "This view summarizes the cohort."
            )
        ).toBe(true);
        expect(
            activeSnapshots.some(
                (snapshot) =>
                    snapshot?.reasoningText === "Checking the response shape."
            )
        ).toBe(true);

        const snapshot = controller.getSnapshot();
        expect(snapshot.messages).toHaveLength(2);
        expect(snapshot.messages[1]).toMatchObject({
            kind: "assistant",
            text: "This view summarizes the cohort. Try asking for a sort or filter to turn it into an action.",
        });
    });

    it("marks the session unavailable when preflight fails and preserves queued input", async () => {
        /** @type {(reason?: any) => void} */
        let rejectPreflight;
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const runtime = createRuntimeMock();
        runtime.requestAgentTurn.mockImplementation((message) => {
            if (message === PREFLIGHT_MESSAGE) {
                return new Promise((_, reject) => {
                    rejectPreflight = reject;
                });
            }

            return Promise.resolve({
                response: {
                    type: "answer",
                    message: "Ignored",
                },
                trace: {
                    totalMs: 12,
                },
            });
        });

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        void controller.open();
        await Promise.resolve();

        void controller.sendMessage("Filter to AML.");
        expect(controller.getSnapshot().queuedMessageCount).toBe(1);

        rejectPreflight(new Error("network down"));
        await Promise.resolve();
        await Promise.resolve();

        const snapshot = controller.getSnapshot();
        expect(snapshot.preflightState).toBe("failed");
        expect(snapshot.status).toBe("unavailable");
        expect(snapshot.lastError).toBe(
            "It seems that the agent is currently unavailable."
        );
        expect(snapshot.queuedMessageCount).toBe(1);
        expect(runtime.requestAgentTurn).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(
            "Agent preflight failed:",
            expect.any(Error)
        );
        consoleError.mockRestore();
    });

    it("rejects malformed visibility tool arguments before execution", async () => {
        const runtime = createRuntimeMock();
        const controller = createAgentSessionController(runtime);

        await controller.executeToolCalls([
            {
                callId: "call-visibility",
                name: "setViewVisibility",
                arguments: {
                    selector: '{"scope":[],"view":"reference-sequence"}',
                    visibility: "True",
                },
            },
        ]);

        expect(runtime.setViewVisibility).not.toHaveBeenCalled();
        const rejectionMessage = controller
            .getSnapshot()
            .messages.find(
                (message) =>
                    message.kind === "tool_result" &&
                    message.toolCallId === "call-visibility"
            );
        expect(rejectionMessage).toEqual(
            expect.objectContaining({
                kind: "tool_result",
                toolCallId: "call-visibility",
            })
        );
    });

    it("logs unexpected tool call failures before surfacing them in chat", async () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const runtime = createRuntimeMock();
        runtime.agentApi.jumpToProvenanceState.mockImplementation(() => {
            throw new TypeError("boom");
        });
        runtime.requestAgentTurn.mockImplementation((message) => {
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "I'm here",
                    },
                    trace: {
                        totalMs: 9,
                    },
                });
            }

            return Promise.resolve({
                response: {
                    type: "tool_call",
                    message: "Jump to the previous provenance state.",
                    toolCalls: [
                        {
                            callId: "call-1",
                            name: "jumpToProvenanceState",
                            arguments: {
                                provenanceId: "provenance-1",
                            },
                        },
                    ],
                },
                trace: {
                    totalMs: 10,
                },
            });
        });

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("Go back one step.");

        const snapshot = controller.getSnapshot();
        expect(snapshot.status).toBe("error");
        expect(snapshot.lastError).toContain("boom");
        expect(
            snapshot.messages.some((message) => message.kind === "error")
        ).toBe(true);
        expect(consoleError).toHaveBeenCalledWith(
            "Agent tool call failed:",
            "jumpToProvenanceState",
            expect.any(TypeError)
        );
        consoleError.mockRestore();
    });

    it("stops promptly when the same rejected tool call repeats", async () => {
        const runtime = createRuntimeMock();
        let agentTurnCallCount = 0;
        runtime.requestAgentTurn.mockImplementation((message) => {
            agentTurnCallCount += 1;
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "I'm here",
                    },
                    trace: {
                        totalMs: 9,
                    },
                });
            }

            return Promise.resolve({
                response: {
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: `call-${agentTurnCallCount}`,
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: "true",
                            },
                        },
                    ],
                },
                trace: {
                    totalMs: 10,
                },
            });
        });

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage(
            "I cannot see the reference sequence in the visualization."
        );

        const snapshot = controller.getSnapshot();
        expect(runtime.requestAgentTurn).toHaveBeenCalledTimes(3);
        expect(snapshot.status).toBe("error");
        expect(snapshot.lastError).toBe(
            "The agent repeated the same rejected tool call after validation failure."
        );
        expect(
            snapshot.messages.some(
                (message) =>
                    message.kind === "error" &&
                    message.text ===
                        "The agent repeated the same rejected tool call after validation failure."
            )
        ).toBe(true);
    });

    it("stops promptly when the same successful tool call repeats", async () => {
        const runtime = createRuntimeMock();
        let agentTurnCallCount = 0;
        const observedHistories = [];
        runtime.requestAgentTurn.mockImplementation(
            function (message, history) {
                agentTurnCallCount += 1;
                if (message === PREFLIGHT_MESSAGE) {
                    return Promise.resolve({
                        response: {
                            type: "answer",
                            message: "I'm here",
                        },
                        trace: {
                            totalMs: 9,
                        },
                    });
                }

                observedHistories.push(history);

                if (agentTurnCallCount <= 3) {
                    return Promise.resolve({
                        response: {
                            type: "tool_call",
                            message: "I will update visibility.",
                            toolCalls: [
                                {
                                    callId: `call-${agentTurnCallCount}`,
                                    name: "setViewVisibility",
                                    arguments: {
                                        selector: {
                                            scope: [],
                                            view: "reference-sequence",
                                        },
                                        visibility: true,
                                    },
                                },
                            ],
                        },
                        trace: {
                            totalMs: 10,
                        },
                    });
                }

                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "That view is already visible.",
                    },
                    trace: {
                        totalMs: 10,
                    },
                });
            }
        );

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage("Make the reference sequence visible.");

        const snapshot = controller.getSnapshot();
        expect(runtime.requestAgentTurn).toHaveBeenCalledTimes(4);
        expect(runtime.setViewVisibility).toHaveBeenCalledTimes(1);
        expect(snapshot.status).toBe("ready");
        expect(snapshot.lastError).toBe("");
        expect(
            snapshot.messages.some((message) => message.kind === "error")
        ).toBe(false);
        expect(
            snapshot.messages.some(
                (message) =>
                    message.kind === "tool_result" &&
                    typeof message.text === "string" &&
                    message.text.includes(
                        "repeating it unchanged will not help"
                    )
            )
        ).toBe(true);
        expect(
            observedHistories.some((history) =>
                history.some(
                    (message) =>
                        message.kind === "tool_result" &&
                        typeof message.text === "string" &&
                        message.text.includes(
                            "repeating it unchanged will not help"
                        )
                )
            )
        ).toBe(true);
    });

    it("allows several varied rejected tool calls before stopping on budget", async () => {
        const runtime = createRuntimeMock();
        let agentTurnCallCount = 0;
        runtime.requestAgentTurn.mockImplementation((message) => {
            agentTurnCallCount += 1;
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "I'm here",
                    },
                    trace: {
                        totalMs: 9,
                    },
                });
            }

            return Promise.resolve({
                response: {
                    type: "tool_call",
                    message: "I will update visibility.",
                    toolCalls: [
                        {
                            callId: `call-${agentTurnCallCount}`,
                            name: "setViewVisibility",
                            arguments: {
                                selector:
                                    '{"scope":[],"view":"reference-sequence"}',
                                visibility: `true-${agentTurnCallCount}`,
                            },
                        },
                    ],
                },
                trace: {
                    totalMs: 10,
                },
            });
        });

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        await controller.sendMessage(
            "I cannot see the reference sequence in the visualization."
        );

        const snapshot = controller.getSnapshot();
        expect(runtime.requestAgentTurn).toHaveBeenCalledTimes(6);
        expect(snapshot.status).toBe("error");
        expect(snapshot.lastError).toBe(
            "The agent produced too many rejected tool calls without converging."
        );
        expect(
            snapshot.messages.some(
                (message) =>
                    message.kind === "error" &&
                    message.text ===
                        "The agent produced too many rejected tool calls without converging."
            )
        ).toBe(true);
    });

    it("cancels the active turn and ignores late agent responses", async () => {
        const runtime = createRuntimeMock();
        let resolvePlan;
        /** @type {AbortSignal | undefined} */
        let observedSignal;
        runtime.requestAgentTurn.mockImplementation(
            (
                message,
                history,
                stream,
                allowStreaming,
                contextOptions,
                signal
            ) => {
                if (message === PREFLIGHT_MESSAGE) {
                    return Promise.resolve({
                        response: {
                            type: "answer",
                            message: "I'm here",
                        },
                        trace: {
                            totalMs: 9,
                        },
                    });
                }

                observedSignal = signal;
                return new Promise((resolve) => {
                    resolvePlan = resolve;
                });
            }
        );

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        await controller.open();
        const sendPromise = controller.sendMessage(
            "Show me the highest-purity sample from each patient."
        );

        expect(controller.getSnapshot().status).toBe("thinking");
        controller.stopCurrentTurn();
        expect(observedSignal?.aborted).toBe(true);
        expect(controller.getSnapshot()).toEqual(
            expect.objectContaining({
                status: "ready",
                pendingRequest: null,
                pendingResponsePlaceholder: "",
            })
        );

        resolvePlan?.({
            response: {
                type: "answer",
                message: "Still here.",
            },
            trace: {
                totalMs: 11,
            },
        });
        await sendPromise;

        const snapshot = controller.getSnapshot();
        expect(snapshot.status).toBe("ready");
        expect(snapshot.lastError).toBe("");
        expect(snapshot.messages).toEqual([
            expect.objectContaining({
                kind: "user",
                text: "Show me the highest-purity sample from each patient.",
            }),
        ]);
    });
});

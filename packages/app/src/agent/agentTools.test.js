import { describe, expect, it, vi } from "vitest";
import { ToolCallRejectionError, createAgentTools } from "./agentTools.js";

function createRuntimeStub() {
    let expanded = false;
    let visible = true;
    const view = {
        isVisible: vi.fn(() => visible),
    };

    return {
        expandViewNode: vi.fn(() => {
            expanded = true;
        }),
        collapseViewNode: vi.fn(() => {
            expanded = false;
        }),
        resolveViewSelector: vi.fn(() => view),
        isViewNodeExpanded: vi.fn(() => expanded),
        isViewVisible: vi.fn(() => visible),
        setViewVisibility: vi.fn((selector, nextVisible) => {
            visible = nextVisible;
        }),
        clearViewVisibility: vi.fn(() => {
            visible = true;
        }),
        getAgentContext: vi.fn(() => ({
            selectionAggregation: {
                fields: [
                    {
                        candidateId: "brush@track:beta",
                        viewSelector: {
                            scope: [],
                            view: "track",
                        },
                        selectionSelector: {
                            scope: [],
                            param: "brush",
                        },
                        field: "beta",
                        supportedAggregations: ["max"],
                    },
                ],
            },
        })),
        submitIntentProgram: vi.fn(async () => ({
            executedActions: 1,
            content: {
                kind: "intent_program_result",
            },
            summaries: [
                {
                    content: "Executed 1 action.",
                    text: "Executed 1 action.",
                },
            ],
        })),
        summarizeExecutionResult: vi.fn(() => "Executed 1 action."),
    };
}

describe("agentTools", () => {
    it("delegates expand and collapse operations to the runtime", () => {
        const runtime = createRuntimeStub();
        const tools = createAgentTools(runtime);

        expect(
            tools.expandViewNode({
                selector: {
                    scope: [],
                    view: "track",
                },
            })
        ).toEqual(
            expect.objectContaining({
                text: "Expanded the requested view branch.",
                content: expect.objectContaining({
                    kind: "view_state_change",
                    domain: "agent_context",
                    field: "collapsed",
                }),
            })
        );

        expect(
            tools.collapseViewNode({
                selector: {
                    scope: [],
                    view: "track",
                },
            })
        ).toEqual(
            expect.objectContaining({
                text: "Collapsed the requested view branch.",
                content: expect.objectContaining({
                    kind: "view_state_change",
                    domain: "agent_context",
                    field: "collapsed",
                }),
            })
        );

        expect(runtime.expandViewNode).toHaveBeenCalledWith({
            scope: [],
            view: "track",
        });
        expect(runtime.collapseViewNode).toHaveBeenCalledWith({
            scope: [],
            view: "track",
        });
    });

    it("resolves selection aggregation candidates through the current context", () => {
        const runtime = createRuntimeStub();
        const tools = createAgentTools(runtime);

        const result = tools.resolveSelectionAggregationCandidate({
            candidateId: "brush@track:beta",
            aggregation: "max",
        });

        expect(result.text).toContain("Resolved");
        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "selection_aggregation_resolution",
                candidateId: "brush@track:beta",
                aggregation: "max",
            })
        );
        expect(runtime.getAgentContext).toHaveBeenCalledTimes(1);
    });

    it("summarizes intent program execution through the runtime", async () => {
        const runtime = createRuntimeStub();
        const tools = createAgentTools(runtime);

        const result = await tools.submitIntentProgram({
            program: {
                schemaVersion: 1,
                steps: [],
            },
        });

        expect(result).toEqual(
            expect.objectContaining({
                text: "Executed 1 action.",
                content: expect.objectContaining({
                    kind: "intent_program_result",
                }),
            })
        );
        expect(runtime.submitIntentProgram).toHaveBeenCalledTimes(1);
        expect(runtime.summarizeExecutionResult).toHaveBeenCalledTimes(1);
    });

    it("fails fast when a selector does not resolve", () => {
        const runtime = createRuntimeStub();
        runtime.resolveViewSelector.mockReturnValueOnce(undefined);
        const tools = createAgentTools(runtime);

        expect(() =>
            tools.setViewVisibility({
                selector: {
                    scope: [],
                    view: "missing",
                },
                visibility: false,
            })
        ).toThrow(ToolCallRejectionError);
    });

    it("rejects unknown selection aggregation candidates as tool errors", () => {
        const runtime = createRuntimeStub();
        runtime.getAgentContext.mockReturnValueOnce({
            selectionAggregation: {
                fields: [],
            },
        });
        const tools = createAgentTools(runtime);

        expect(() =>
            tools.resolveSelectionAggregationCandidate({
                candidateId: "missing-candidate",
                aggregation: "max",
            })
        ).toThrow(ToolCallRejectionError);
    });
});

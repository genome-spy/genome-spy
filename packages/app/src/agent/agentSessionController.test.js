import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentSessionController } from "./agentSessionController.js";

const PREFLIGHT_MESSAGE = "__genomespy_preflight__";

/**
 * @returns {{
 *     requestPlan: ReturnType<typeof vi.fn>;
 *     validateIntentProgram: ReturnType<typeof vi.fn>;
 *     submitIntentProgram: ReturnType<typeof vi.fn>;
 *     summarizeExecutionResult: ReturnType<typeof vi.fn>;
 *     summarizeIntentProgram: ReturnType<typeof vi.fn>;
 * }}
 */
function createRuntimeMock() {
    return {
        requestPlan: vi.fn(),
        validateIntentProgram: vi.fn(),
        submitIntentProgram: vi.fn(),
        summarizeExecutionResult: vi.fn(),
        summarizeIntentProgram: vi.fn(),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("createAgentSessionController", () => {
    it("parses numbered clarification choices from the planner response", async () => {
        const runtime = createRuntimeMock();
        runtime.requestPlan.mockImplementation((message) => {
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "Preflight OK",
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

    it("queues input during preflight and drains it after preflight succeeds", async () => {
        /** @type {(value: any) => void} */
        let resolvePreflight;
        const runtime = createRuntimeMock();
        runtime.requestPlan.mockImplementation((message) => {
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
        runtime.validateIntentProgram.mockReturnValue({
            ok: true,
            errors: [],
            program: {
                schemaVersion: 1,
                steps: [],
            },
        });
        runtime.submitIntentProgram.mockResolvedValue({
            ok: true,
            executedActions: 0,
            summaries: [],
            program: {
                schemaVersion: 1,
                steps: [],
            },
        });
        runtime.summarizeIntentProgram.mockReturnValue([]);
        runtime.summarizeExecutionResult.mockReturnValue("Executed 0 actions.");

        const controller = createAgentSessionController(runtime);
        controller.subscribe(() => {});

        void controller.open();
        await Promise.resolve();

        void controller.sendMessage("Show me the current view.");
        expect(controller.getSnapshot().queuedMessageCount).toBe(1);
        expect(runtime.requestPlan).toHaveBeenCalledTimes(1);
        expect(runtime.requestPlan.mock.calls[0][0]).toBe(PREFLIGHT_MESSAGE);

        resolvePreflight({
            response: {
                type: "answer",
                message: "Preflight OK",
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
        expect(runtime.requestPlan).toHaveBeenCalledTimes(2);
        expect(runtime.requestPlan.mock.calls[1][0]).toBe(
            "Show me the current view."
        );
    });

    it("publishes active-turn stream updates before the final response", async () => {
        const runtime = createRuntimeMock();
        runtime.requestPlan.mockImplementation((message, history, stream) => {
            if (message === PREFLIGHT_MESSAGE) {
                return Promise.resolve({
                    response: {
                        type: "answer",
                        message: "Preflight OK",
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
        });

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
        const runtime = createRuntimeMock();
        runtime.requestPlan.mockImplementation((message) => {
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
        expect(runtime.requestPlan).toHaveBeenCalledTimes(1);
    });
});

import { html } from "lit";
import { createAgentSessionController } from "./agentSessionController.js";
import "./chatPanel.js";

/**
 * @typedef {"answer" | "clarify" | "tool_call" | "error"} MockScenario
 */

const PREFLIGHT_MESSAGE = 'Preflight check: answer with just "I\'m here".';

/** @type {Map<string, ReturnType<typeof createAgentSessionController>>} */
const controllerCache = new Map();

export default {
    title: "Agent/ChatPanel",
    tags: ["autodocs"],
    args: {
        scenario: "tool_call",
        streamDelayMs: 0,
        heartbeatIntervalMs: 0,
    },
    argTypes: {
        scenario: {
            control: {
                type: "select",
                options: ["answer", "clarify", "tool_call", "error"],
            },
        },
        preflightDelayMs: {
            control: {
                type: "number",
                min: 0,
                step: 100,
            },
        },
        preflightFails: {
            control: "boolean",
        },
        streamDelayMs: {
            control: {
                type: "number",
                min: 0,
                step: 50,
            },
        },
        heartbeatIntervalMs: {
            control: {
                type: "number",
                min: 0,
                step: 50,
            },
        },
    },
};

/**
 * @param {MockScenario} scenario
 * @param {{
 *     preflightDelayMs?: number;
 *     preflightFails?: boolean;
 *     streamDelayMs?: number;
 *     heartbeatIntervalMs?: number;
 * }} [options]
 * @returns {ReturnType<typeof createAgentSessionController>}
 */
function createMockAgentController(scenario, options = {}) {
    const {
        preflightDelayMs = 0,
        preflightFails = false,
        streamDelayMs = 0,
        heartbeatIntervalMs = 0,
    } = options;
    /** @type {import("./types.d.ts").AgentProvenanceAction[]} */
    const provenanceHistory = [];
    const baseContext = /** @type {any} */ ({
        schemaVersion: 1,
        sampleSummary: {
            sampleCount: 124,
            groupCount: 3,
            visibleSampleCount: 124,
        },
        sampleGroupLevels: [
            {
                level: 0,
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "diagnosis",
                },
                title: "Diagnosis",
            },
        ],
        viewRoot: {
            type: "other",
            name: "root",
            title: "Visualization root",
            description: "",
            visible: true,
            parameterDeclarations: [
                {
                    parameterType: "selection",
                    selectionType: "interval",
                    label: "brush",
                    selector: {
                        scope: [],
                        param: "brush",
                    },
                    persist: true,
                    clearable: true,
                    encodings: ["x"],
                    value: {
                        type: "interval",
                        intervals: {
                            x: [
                                { chrom: "chr1", pos: 12 },
                                { chrom: "chr1", pos: 34 },
                            ],
                        },
                    },
                },
                {
                    parameterType: "variable",
                    label: "Threshold",
                    selector: {
                        scope: [],
                        param: "threshold",
                    },
                    persist: true,
                    value: 0.6,
                    bind: {
                        input: "range",
                        label: "Threshold",
                        description: "Adjust the cutoff.",
                        min: 0,
                        max: 1,
                        step: 0.1,
                    },
                },
            ],
            children: [],
        },
        attributes: [
            {
                id: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
                name: "age",
                title: "Age",
                dataType: "quantitative",
                source: "SAMPLE_ATTRIBUTE",
                visible: true,
            },
            {
                id: { type: "SAMPLE_ATTRIBUTE", specifier: "diagnosis" },
                name: "diagnosis",
                title: "Diagnosis",
                dataType: "nominal",
                source: "SAMPLE_ATTRIBUTE",
                visible: true,
            },
        ],
        intentActionSummaries: [],
        provenance: [
            {
                summary: "Set samples",
                type: "sampleView/setSamples",
            },
        ],
    });
    let issuedToolCall = false;

    const runtime = /** @type {any} */ ({
        getAgentContext: () => baseContext,
        getAgentVolatileContext: () => ({
            selectionAggregation: {
                fields: /** @type {import("./types.d.ts").AgentSelectionAggregationContext["fields"]} */ ([]),
            },
        }),
        requestAgentTurn: async (
            /** @type {string} */ message,
            /** @type {Array<any>} */ _history = [],
            /** @type {any} */ streamCallbacks = {},
            /** @type {boolean} */ allowStreaming = true
        ) => {
            if (message === PREFLIGHT_MESSAGE) {
                if (preflightDelayMs > 0) {
                    await delay(preflightDelayMs);
                }

                if (preflightFails) {
                    throw new Error(
                        "Mock agent turn is unavailable during preflight."
                    );
                }

                return {
                    response: {
                        type: "answer",
                        message: "I'm here",
                    },
                    trace: {
                        message,
                        totalMs: preflightDelayMs || 10,
                    },
                };
            }

            const normalized = message.toLowerCase();

            if (scenario === "error" || normalized.includes("error")) {
                throw new Error(
                    "Mock agent turn error: the request could not be parsed."
                );
            }

            if (
                scenario === "clarify" ||
                normalized.includes("which") ||
                normalized.includes("what attribute")
            ) {
                await streamText(
                    streamCallbacks,
                    "Which attribute should I use?",
                    {
                        streamDelayMs,
                        heartbeatIntervalMs,
                    }
                );

                return {
                    response: {
                        type: "clarify",
                        message:
                            "Which attribute should I use?\n\n1. Age\n2. Diagnosis",
                    },
                    trace: {
                        message,
                        totalMs: 12,
                    },
                };
            }

            if (
                scenario === "answer" ||
                normalized.includes("what") ||
                normalized.includes("help")
            ) {
                await streamText(
                    streamCallbacks,
                    "This view summarizes the cohort. Try asking for a sort or filter to turn it into an action.",
                    {
                        streamDelayMs,
                        heartbeatIntervalMs,
                        reasoningText:
                            "I am checking the available cohort-level interactions.",
                    }
                );

                return {
                    response: {
                        type: "answer",
                        message:
                            "This view summarizes the cohort. Try asking for a **sort** or **filter** to turn it into an action.",
                    },
                    trace: {
                        message,
                        totalMs: 12,
                    },
                };
            }

            if (scenario === "tool_call" && !issuedToolCall) {
                issuedToolCall = true;
                await streamText(
                    streamCallbacks,
                    "I should expand the reference-sequence branch to inspect it.",
                    {
                        streamDelayMs,
                        heartbeatIntervalMs,
                        reasoningText:
                            "The reference sequence is collapsed, so I need to expand it first.",
                    }
                );

                return {
                    response: {
                        type: "tool_call",
                        message:
                            "I should expand the reference-sequence branch to inspect it.",
                        toolCalls: [
                            {
                                callId: "call_reference_sequence",
                                name: "expandViewNode",
                                arguments: /** @type {any} */ ({
                                    selector: {
                                        scope: /** @type {any[]} */ ([]),
                                        view: "reference-sequence",
                                    },
                                }),
                            },
                        ],
                    },
                    trace: {
                        message,
                        totalMs: 15,
                    },
                };
            }

            return {
                response: {
                    type: "tool_call",
                    message: "I should submit actions to sort the samples.",
                    toolCalls: [
                        {
                            callId: "call_submit_intent_batch",
                            name: "submitIntentActions",
                            arguments: /** @type {any} */ ({
                                ...buildMockIntentActionRequest(normalized),
                            }),
                        },
                    ],
                },
                trace: {
                    message,
                    totalMs: 18,
                },
            };
        },
        submitIntentActions: async (/** @type {any} */ batch) => {
            const summaries = batch.steps.map((/** @type {any} */ step) =>
                summarizeMockStep(step)
            );
            const provenanceIds = batch.steps.map(
                (/** @type {any} */ _step, /** @type {number} */ index) =>
                    "provenance-" + (provenanceHistory.length + index)
            );
            for (let index = 0; index < batch.steps.length; index += 1) {
                provenanceHistory.push({
                    summary: summaries[index].text,
                    provenanceId: provenanceIds[index],
                    type: batch.steps[index].actionType,
                    payload: batch.steps[index].payload,
                });
            }

            return {
                ok: true,
                executedActions: batch.steps.length,
                summaries,
                batch,
                content: {
                    kind: "intent_batch_result",
                    batch,
                    provenanceIds,
                },
            };
        },
        summarizeExecutionResult: (/** @type {any} */ result) =>
            [
                "Executed " + result.executedActions + " action(s).",
                ...result.summaries.map(
                    (/** @type {any} */ summary) => summary.text
                ),
            ].join("\n"),
        summarizeProvenanceActionsSince: (/** @type {number} */ startIndex) =>
            provenanceHistory
                .slice(startIndex)
                .map(
                    (
                        /** @type {import("./types.d.ts").AgentProvenanceAction} */ action
                    ) => ({
                        content: action.summary ?? action.type,
                        text: action.summary ?? action.type,
                    })
                ),
    });

    return createAgentSessionController(runtime);
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

/**
 * @param {Record<string, any>} streamCallbacks
 * @param {string} text
 * @param {{
 *     streamDelayMs?: number;
 *     heartbeatIntervalMs?: number;
 *     reasoningText?: string;
 * }} [options]
 * @returns {Promise<void>}
 */
async function streamText(streamCallbacks, text, options = {}) {
    const {
        streamDelayMs = 0,
        heartbeatIntervalMs = 0,
        reasoningText = "",
    } = options;

    if (reasoningText && streamCallbacks.onReasoning) {
        streamCallbacks.onReasoning(reasoningText);
    }

    const chunks = splitIntoChunks(text);
    for (let index = 0; index < chunks.length; index += 1) {
        if (heartbeatIntervalMs > 0 && streamCallbacks.onHeartbeat) {
            await delay(heartbeatIntervalMs);
            streamCallbacks.onHeartbeat();
        }

        if (streamCallbacks.onDelta) {
            streamCallbacks.onDelta(chunks[index]);
        }

        if (streamDelayMs > 0 && index < chunks.length - 1) {
            await delay(streamDelayMs);
        }
    }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoChunks(text) {
    const words = text.split(/(\s+)/);
    const chunks = [];
    let current = "";

    for (const word of words) {
        if (!word) {
            continue;
        }

        const candidate = current + word;
        if (current && candidate.length > 22 && /\S/.test(word)) {
            chunks.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }

    if (current) {
        chunks.push(current);
    }

    return chunks.length > 0 ? chunks : [text];
}

/**
 * @param {string} normalizedMessage
 * @returns {any}
 */
function buildMockIntentActionRequest(normalizedMessage) {
    if (normalizedMessage.includes("filter")) {
        return {
            note: "Filter the cohort by a discrete attribute.",
            actions: [
                {
                    actionType: "sampleView/filterByNominal",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "diagnosis",
                        },
                        values: ["AML"],
                    },
                },
            ],
        };
    }

    if (normalizedMessage.includes("sort")) {
        return {
            note: "Sort the cohort by a quantitative attribute.",
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
        };
    }

    return {
        note: "Group the cohort by quartiles.",
        actions: [
            {
                actionType: "sampleView/groupToQuartiles",
                payload: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "age",
                    },
                },
            },
        ],
    };
}

/**
 * @param {any} step
 * @returns {import("./types.d.ts").IntentBatchSummaryLine}
 */
function summarizeMockStep(step) {
    if (step.actionType === "sampleView/sortBy") {
        return {
            content: html`
                Sort samples by
                <strong>${step.payload.attribute.specifier}</strong>.
            `,
            text: "Sort samples by " + step.payload.attribute.specifier + ".",
        };
    } else if (step.actionType === "sampleView/filterByNominal") {
        return {
            content: html`
                Retain samples where
                <strong>${step.payload.attribute.specifier}</strong> is
                ${step.payload.values.map(
                    (/** @type {any} */ value, /** @type {number} */ index) =>
                        html`${index > 0 ? ", " : ""}<strong>${value}</strong>`
                )}.
            `,
            text:
                "Retain samples where " +
                step.payload.attribute.specifier +
                " is " +
                step.payload.values.join(", ") +
                ".",
        };
    } else if (step.actionType === "sampleView/groupToQuartiles") {
        return {
            content: html`
                Group samples into quartiles by
                <strong>${step.payload.attribute.specifier}</strong>.
            `,
            text:
                "Group samples into quartiles by " +
                step.payload.attribute.specifier +
                ".",
        };
    } else {
        return {
            content: step.actionType,
            text: step.actionType,
        };
    }
}

/**
 * @param {{
 *     scenario: MockScenario;
 *     preflightDelayMs?: number;
 *     preflightFails?: boolean;
 *     streamDelayMs?: number;
 *     heartbeatIntervalMs?: number;
 *     devMode?: boolean;
 * }} args
 * @returns {import("lit").TemplateResult}
 */
function renderChatPanel(args) {
    const key = JSON.stringify({
        scenario: args.scenario,
        preflightDelayMs: args.preflightDelayMs ?? 0,
        preflightFails: args.preflightFails ?? false,
        streamDelayMs: args.streamDelayMs ?? 0,
        heartbeatIntervalMs: args.heartbeatIntervalMs ?? 0,
    });
    let controller = controllerCache.get(key);
    if (!controller) {
        controller = createMockAgentController(args.scenario, {
            preflightDelayMs: args.preflightDelayMs,
            preflightFails: args.preflightFails,
            streamDelayMs: args.streamDelayMs,
            heartbeatIntervalMs: args.heartbeatIntervalMs,
        });
        controllerCache.set(key, controller);
    }

    return html`
        <div style="width: min(100%, 520px); height: 760px;">
            <gs-agent-chat-panel
                .controller=${controller}
                ?devMode=${args.devMode}
            ></gs-agent-chat-panel>
        </div>
    `;
}

export const Playground = {
    render: renderChatPanel,
};

export const Answer = {
    args: {
        scenario: "answer",
    },
    render: renderChatPanel,
};

export const Clarify = {
    args: {
        scenario: "clarify",
    },
    render: renderChatPanel,
};

export const SubmitIntentActions = {
    args: {
        scenario: "tool_call",
    },
    render: renderChatPanel,
};

export const ErrorState = {
    args: {
        scenario: "error",
    },
    render: renderChatPanel,
};

export const DevToolCall = {
    args: {
        scenario: "tool_call",
        devMode: true,
    },
    render: renderChatPanel,
};

export const ToolCall = {
    args: {
        scenario: "tool_call",
    },
    render: renderChatPanel,
};

export const PreflightPending = {
    args: {
        scenario: "tool_call",
        preflightDelayMs: 1600,
    },
    render: renderChatPanel,
};

export const StreamingAnswer = {
    args: {
        scenario: "answer",
        streamDelayMs: 120,
        heartbeatIntervalMs: 400,
    },
    render: renderChatPanel,
};

export const StreamingClarify = {
    args: {
        scenario: "clarify",
        streamDelayMs: 120,
        heartbeatIntervalMs: 400,
    },
    render: renderChatPanel,
};

export const Unavailable = {
    args: {
        scenario: "answer",
        preflightFails: true,
    },
    render: renderChatPanel,
};

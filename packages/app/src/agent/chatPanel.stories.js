import { html } from "lit";
import { createAgentSessionController } from "./agentSessionController.js";
import "./chatPanel.js";

/**
 * @typedef {"answer" | "clarify" | "intent_program" | "error"} MockScenario
 */

const PREFLIGHT_MESSAGE = "__genomespy_preflight__";

/** @type {Map<string, ReturnType<typeof createAgentSessionController>>} */
const controllerCache = new Map();

export default {
    title: "Agent/ChatPanel",
    tags: ["autodocs"],
    args: {
        scenario: "intent_program",
    },
    argTypes: {
        scenario: {
            control: {
                type: "select",
                options: ["answer", "clarify", "intent_program", "error"],
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
    },
};

/**
 * @param {MockScenario} scenario
 * @param {{ preflightDelayMs?: number; preflightFails?: boolean }} [options]
 * @returns {ReturnType<typeof createAgentSessionController>}
 */
function createMockAgentController(scenario, options = {}) {
    const { preflightDelayMs = 0, preflightFails = false } = options;
    const baseContext = /** @type {any} */ ({
        schemaVersion: 1,
        sampleSummary: {
            sampleCount: 124,
            groupCount: 3,
        },
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
        actionCatalog: [],
        viewWorkflows: {
            workflows: [],
        },
        provenance: [
            {
                summary: "Set samples",
                type: "sampleView/setSamples",
            },
        ],
        lifecycle: {
            appInitialized: true,
        },
    });

    const runtime = /** @type {any} */ ({
        getAgentContext: () => baseContext,
        requestPlan: async (/** @type {string} */ message) => {
            if (message === PREFLIGHT_MESSAGE) {
                if (preflightDelayMs > 0) {
                    await delay(preflightDelayMs);
                }

                if (preflightFails) {
                    throw new Error(
                        "Mock planner is unavailable during preflight."
                    );
                }

                return {
                    response: {
                        type: "answer",
                        message: "Preflight check completed.",
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
                    "Mock planner error: the request could not be parsed."
                );
            }

            if (
                scenario === "clarify" ||
                normalized.includes("which") ||
                normalized.includes("what attribute")
            ) {
                return {
                    response: {
                        type: "clarify",
                        message: "Which attribute should I use?",
                        options: [
                            {
                                value: "age",
                                label: "Age",
                            },
                            {
                                value: "diagnosis",
                                label: "Diagnosis",
                            },
                        ],
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

            return {
                response: {
                    type: "intent_program",
                    program: buildMockIntentProgram(normalized),
                },
                trace: {
                    message,
                    totalMs: 18,
                },
            };
        },
        validateIntentProgram: (/** @type {any} */ program) => {
            if (
                !program ||
                typeof program !== "object" ||
                !Array.isArray(program.steps) ||
                program.steps.length === 0
            ) {
                return /** @type {any} */ ({
                    ok: false,
                    errors: ["The mock planner did not return any steps."],
                });
            }

            return /** @type {any} */ ({
                ok: true,
                errors: [],
                program,
            });
        },
        submitIntentProgram: async (/** @type {any} */ program) => {
            const summaries = program.steps.map((/** @type {any} */ step) =>
                summarizeMockStep(step)
            );

            return {
                ok: true,
                executedActions: program.steps.length,
                summaries,
                program,
            };
        },
        summarizeExecutionResult: (/** @type {any} */ result) =>
            [
                "Executed " + result.executedActions + " action(s).",
                ...result.summaries.map(
                    (/** @type {any} */ summary) => summary.text
                ),
            ].join("\n"),
        summarizeIntentProgram: (/** @type {any} */ program) =>
            program.steps.map((/** @type {any} */ step) =>
                summarizeMockStep(step)
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
 * @param {string} normalizedMessage
 * @returns {any}
 */
function buildMockIntentProgram(normalizedMessage) {
    if (normalizedMessage.includes("filter")) {
        return {
            schemaVersion: 1,
            rationale: "Filter the cohort by a discrete attribute.",
            steps: [
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
            schemaVersion: 1,
            rationale: "Sort the cohort by a quantitative attribute.",
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
        };
    }

    return {
        schemaVersion: 1,
        rationale: "Group the cohort by quartiles.",
        steps: [
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
 * @returns {import("./types.d.ts").IntentProgramSummaryLine}
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
 * }} args
 * @returns {import("lit").TemplateResult}
 */
function renderChatPanel(args) {
    const key = JSON.stringify({
        scenario: args.scenario,
        preflightDelayMs: args.preflightDelayMs ?? 0,
        preflightFails: args.preflightFails ?? false,
    });
    let controller = controllerCache.get(key);
    if (!controller) {
        controller = createMockAgentController(args.scenario, {
            preflightDelayMs: args.preflightDelayMs,
            preflightFails: args.preflightFails,
        });
        controllerCache.set(key, controller);
    }

    return html`
        <div style="width: min(100%, 520px); height: 760px;">
            <gs-agent-chat-panel
                .controller=${controller}
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

export const IntentProgram = {
    args: {
        scenario: "intent_program",
    },
    render: renderChatPanel,
};

export const ErrorState = {
    args: {
        scenario: "error",
    },
    render: renderChatPanel,
};

export const PreflightPending = {
    args: {
        scenario: "intent_program",
        preflightDelayMs: 1600,
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

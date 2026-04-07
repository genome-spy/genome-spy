import { html } from "lit";
import "./chatPanel.js";

/**
 * @typedef {"answer" | "clarify" | "intent_program" | "error"} MockScenario
 */

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
    },
};

/**
 * @param {MockScenario} scenario
 * @returns {any}
 */
function createMockAgentController(scenario) {
    const baseContext = /** @type {any} */ ({
        schemaVersion: 1,
        view: {
            type: "sampleView",
            name: "sampleView",
            title: "Cohort overview",
            sampleCount: 124,
            attributeCount: 7,
            groupCount: 3,
        },
        viewTree: {
            root: {
                type: "root",
                name: "root",
                title: "Visualization root",
                description: "",
                visible: true,
                selectionDeclarations: [
                    {
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
                                x: [12, 34],
                            },
                        },
                    },
                ],
                children: [],
            },
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

    return {
        getAgentContext: () => baseContext,
        requestPlan: async (/** @type {string} */ message) => {
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
    };
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
                    actionType: "filterByNominal",
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
                    actionType: "sortBy",
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
                actionType: "groupToQuartiles",
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
    if (step.actionType === "sortBy") {
        return {
            content: html`
                Sort samples by
                <strong>${step.payload.attribute.specifier}</strong>.
            `,
            text: "Sort samples by " + step.payload.attribute.specifier + ".",
        };
    } else if (step.actionType === "filterByNominal") {
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
    } else if (step.actionType === "groupToQuartiles") {
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
 * @param {{ scenario: MockScenario }} args
 * @returns {import("lit").TemplateResult}
 */
function renderChatPanel(args) {
    return html`
        <div style="width: min(100%, 520px); height: 760px;">
            <gs-agent-chat-panel
                .controller=${createMockAgentController(args.scenario)}
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

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
    const baseContext = {
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
                id: "view-root",
                kind: "root",
                type: "root",
                name: "root",
                title: "Visualization root",
                visible: true,
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
        actionSummaries: [
            {
                actionType: "sortBy",
                title: "Sort samples",
                description:
                    "Sort samples in descending order by an attribute.",
            },
        ],
        viewWorkflows: {
            workflows: [],
            selections: [],
        },
        provenance: [
            {
                summary: "Set samples",
                type: "sampleView/setSamples",
            },
        ],
        params: [
            {
                key: "brush",
                selector: { scope: [], param: "brush" },
                value: [12, 34],
            },
        ],
        promptHints: [],
        lifecycle: {
            appInitialized: true,
        },
    };

    return {
        getAgentContext: () => baseContext,
        requestPlan: async (message) => {
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
                            "This view summarizes the cohort. Try asking for a sort or filter to turn it into an action.",
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
        validateIntentProgram: (program) => {
            if (
                !program ||
                typeof program !== "object" ||
                !Array.isArray(program.steps) ||
                program.steps.length === 0
            ) {
                return {
                    ok: false,
                    errors: ["The mock planner did not return any steps."],
                };
            }

            return {
                ok: true,
                errors: [],
                program,
            };
        },
        submitIntentProgram: async (program) => {
            const summaries = program.steps.map((step) =>
                summarizeMockStep(step)
            );

            return {
                ok: true,
                executedActions: program.steps.length,
                summaries,
                program,
            };
        },
        summarizeExecutionResult: (result) =>
            [
                "Executed " + result.executedActions + " action(s).",
                ...result.summaries,
            ].join("\n"),
    };
}

/**
 * @param {string} normalizedMessage
 * @returns {import("./types.d.ts").IntentProgram}
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
 * @param {import("./types.d.ts").IntentProgramStep} step
 * @returns {string}
 */
function summarizeMockStep(step) {
    if (step.actionType === "sortBy") {
        return "Sort samples by " + step.payload.attribute.specifier + ".";
    } else if (step.actionType === "filterByNominal") {
        return (
            "Retain samples where " +
            step.payload.attribute.specifier +
            " is " +
            step.payload.values.join(", ") +
            "."
        );
    } else if (step.actionType === "groupToQuartiles") {
        return (
            "Group samples into quartiles by " +
            step.payload.attribute.specifier +
            "."
        );
    } else {
        return step.actionType;
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

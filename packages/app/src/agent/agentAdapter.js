import { showMessageDialog } from "../components/generic/messageDialog.js";
import { showAgentChoiceDialog } from "../components/dialogs/agentChoiceDialog.js";
import showHierarchyBoxplotDialog from "../charts/hierarchyBoxplotDialog.js";
import { getAgentContext } from "./contextBuilder.js";
import {
    submitIntentProgram,
    summarizeExecutionResult,
} from "./intentProgramExecutor.js";
import { validateIntentProgram } from "./intentProgramValidator.js";
import { summarizeIntentProgram } from "./actionCatalog.js";
import { getViewWorkflowContext } from "./viewWorkflowContext.js";
import { resolveViewWorkflow } from "./viewWorkflowResolver.js";

const DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:8000";

function now() {
    return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * @param {number} startedAt
 * @returns {number}
 */
function elapsedMilliseconds(startedAt) {
    return Math.round((now() - startedAt) * 10) / 10;
}

/**
 * @param {Record<string, any>} trace
 */
function publishAgentTrace(trace) {
    trace.timestamp = new Date().toISOString();

    if (typeof window === "undefined") {
        return;
    }

    const app = /** @type {any} */ (window).__genomeSpyApp;
    app?.recordAgentTrace?.(trace);
    /** @type {any} */ (window).__genomeSpyLastAgentTrace = trace;
    console.groupCollapsed(
        "[GenomeSpy Agent] " + trace.message + " (" + trace.totalMs + " ms)"
    );
    console.table(trace);
    console.groupEnd();
}

/**
 * @param {import("../app.js").default} app
 */
export function createAgentAdapter(app) {
    return {
        getAgentContext: () => getAgentContext(app),
        validateIntentProgram: (/** @type {unknown} */ program) =>
            validateIntentProgram(app, program),
        submitIntentProgram: (
            /** @type {import("./types.js").IntentProgram} */ program
        ) => submitIntentProgram(app, program),
        summarizeExecutionResult,
        requestPlan: (
            /** @type {string} */ message,
            /** @type {string[]} */ history = []
        ) => requestPlan(app, { message, history }),
        runLocalPrompt: () => runLocalPrompt(app),
    };
}

/**
 * @param {import("../app.js").default} app
 * @param {{ message: string, history?: string[] }} options
 * @returns {Promise<{ response: import("./types.js").PlanResponse, trace: Record<string, any> }>}
 */
async function requestPlan(app, options) {
    const baseUrl = app.options.agentBaseUrl ?? DEFAULT_AGENT_BASE_URL;
    const startedAt = now();
    const contextStartedAt = now();
    const context = getAgentContext(app);
    const contextBuildMs = elapsedMilliseconds(contextStartedAt);

    const requestStartedAt = now();
    const response = await fetch(baseUrl + "/v1/plan", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            message: options.message,
            history: options.history ?? [],
            context,
        }),
    });
    const requestMs = elapsedMilliseconds(requestStartedAt);

    if (!response.ok) {
        throw new Error(
            "Local agent request failed with status " + response.status + "."
        );
    }

    const parseStartedAt = now();
    const parsedResponse = await response.json();
    const responseParseMs = elapsedMilliseconds(parseStartedAt);

    return {
        response: parsedResponse,
        trace: {
            message: options.message,
            contextBuildMs,
            requestMs,
            responseParseMs,
            serverTiming: response.headers.get("server-timing") ?? "n/a",
            agentServerTotalMs:
                response.headers.get("x-genomespy-agent-total-ms") ?? "n/a",
            totalMs: elapsedMilliseconds(startedAt),
        },
    };
}

/**
 * @param {import("../app.js").default} app
 * @returns {Promise<void>}
 */
async function runLocalPrompt(app) {
    const initialMessage = window.prompt("Local agent prompt");
    if (!initialMessage) {
        return;
    }

    const startedAt = now();
    /** @type {Record<string, any>} */
    const trace = { message: initialMessage };
    const history = [];
    let message = initialMessage;
    let clarificationRounds = 0;
    let repairedInvalidIntentProgram = false;

    try {
        while (true) {
            const requestResult = await requestPlan(app, { message, history });
            const response = requestResult.response;
            Object.assign(trace, requestResult.trace);

            if (response.type === "clarify") {
                const workflowType = inferRequestedWorkflowType([
                    initialMessage,
                    ...history,
                    response.message,
                ]).workflowType;
                const groundedClarification = getGroundedPlannerClarification(
                    app,
                    response.message
                );
                if (!groundedClarification) {
                    trace.responseType = response.type;
                    trace.totalMs = elapsedMilliseconds(startedAt);
                    publishAgentTrace(trace);
                    await showMessageDialog(response.message, {
                        title: "Agent Clarification",
                        type: "info",
                    });
                    return;
                }

                if (clarificationRounds >= 3) {
                    throw new Error(
                        "Agent clarification did not converge after 3 rounds."
                    );
                }

                const followUpValue = await showAgentChoiceDialog({
                    title: "Agent Clarification",
                    message: groundedClarification.message,
                    choiceLabel: groundedClarification.choiceLabel,
                    options: groundedClarification.options,
                    value: groundedClarification.value,
                });
                if (!followUpValue) {
                    throw new Error("Agent clarification was cancelled.");
                }

                await runViewWorkflow(
                    app,
                    {
                        ...createSeededViewWorkflowRequest(
                            app,
                            initialMessage,
                            workflowType
                        ),
                        [groundedClarification.slot]: followUpValue,
                    },
                    trace,
                    startedAt
                );
                return;
            }

            if (response.type === "answer") {
                trace.responseType = response.type;
                trace.totalMs = elapsedMilliseconds(startedAt);
                publishAgentTrace(trace);
                await showMessageDialog(response.message, {
                    title: "Agent Response",
                    type: "info",
                });
                return;
            }

            if (response.type === "view_workflow") {
                await runAgentProgram(
                    app,
                    [
                        {
                            type: "view_workflow",
                            workflow: response.workflow,
                        },
                    ],
                    trace,
                    startedAt
                );
                return;
            }

            if (response.type === "agent_program") {
                await runAgentProgram(
                    app,
                    response.program.steps,
                    trace,
                    startedAt
                );
                return;
            }

            if (response.type !== "intent_program") {
                throw new Error(
                    "Unsupported agent response type: " + response.type
                );
            }

            const validationStartedAt = now();
            const validation = validateIntentProgram(app, response.program);
            trace.validationMs = elapsedMilliseconds(validationStartedAt);
            if (!validation.ok) {
                if (
                    !repairedInvalidIntentProgram &&
                    shouldRetryAsViewWorkflow(
                        app,
                        response.program,
                        validation.errors
                    )
                ) {
                    const workflowType = inferRequestedWorkflowType([
                        initialMessage,
                        ...history,
                    ]).workflowType;
                    history.push(
                        message,
                        buildInvalidProgramFeedback(validation.errors)
                    );
                    message = buildViewWorkflowRepairMessage(
                        initialMessage,
                        workflowType
                    );
                    repairedInvalidIntentProgram = true;
                    continue;
                }

                throw new Error(validation.errors.join("\n"));
            }

            await runAgentProgram(
                app,
                [
                    {
                        type: "intent_program",
                        program: validation.program,
                    },
                ],
                trace,
                startedAt
            );
            return;
        }
    } catch (error) {
        trace.error = String(error);
        trace.totalMs = elapsedMilliseconds(startedAt);
        publishAgentTrace(trace);
        await showMessageDialog(String(error), {
            title: "Local Agent Error",
            type: "error",
        });
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").AgentProgramStep[]} steps
 * @param {Record<string, any>} trace
 * @param {number} startedAt
 */
async function runAgentProgram(app, steps, trace, startedAt) {
    const previewStartedAt = now();
    /** @type {Array<{ type: "intent_program", summary: string, program: import("./types.js").IntentProgram } | { type: "view_workflow", summary: string, workflow: import("./types.js").ResolvedViewWorkflow }>} */
    const preparedSteps = [];
    for (const step of steps) {
        preparedSteps.push(await prepareAgentProgramStep(app, step));
    }
    trace.previewBuildMs = elapsedMilliseconds(previewStartedAt);

    const confirmationStartedAt = now();
    const confirmed = await showMessageDialog(
        preparedSteps.map((step) => step.summary).join("\n"),
        {
            title: "Execute Local Agent Plan?",
            type: "info",
            confirm: true,
        }
    );
    trace.confirmationMs = elapsedMilliseconds(confirmationStartedAt);
    if (!confirmed) {
        trace.executed = false;
        trace.totalMs = elapsedMilliseconds(startedAt);
        publishAgentTrace(trace);
        return;
    }

    const executionStartedAt = now();
    let executedActions = 0;
    /** @type {Array<{ executedActions: number, intentProgramResult?: import("./types.js").IntentProgramExecutionResult }>} */
    const executionResults = [];
    for (const step of preparedSteps) {
        const result = await executePreparedAgentProgramStep(app, step);
        executedActions += result.executedActions;
        executionResults.push(result);
    }
    trace.executionMs = elapsedMilliseconds(executionStartedAt);
    trace.executedActions = executedActions;
    trace.executed = true;
    trace.responseType =
        preparedSteps.length > 1 ? "agent_program" : preparedSteps[0].type;
    trace.totalMs = elapsedMilliseconds(startedAt);
    publishAgentTrace(trace);

    if (preparedSteps.length === 1) {
        const [preparedStep] = preparedSteps;
        const [executionResult] = executionResults;

        if (preparedStep.type === "intent_program") {
            await showMessageDialog(
                summarizeExecutionResult(executionResult.intentProgramResult),
                {
                    title: "Local Agent Execution",
                    type: "info",
                }
            );
        } else if (
            preparedStep.workflow.workflowType !== "createBoxplotFromSelection"
        ) {
            await showMessageDialog(
                "Executed 1 action.\n- " + preparedStep.summary,
                {
                    title: "Local Agent Execution",
                    type: "info",
                }
            );
        }
    } else {
        await showMessageDialog(
            "Executed " +
                preparedSteps.length +
                " step" +
                (preparedSteps.length === 1 ? "" : "s") +
                ".",
            {
                title: "Local Agent Execution",
                type: "info",
            }
        );
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").AgentProgramStep} step
 * @returns {Promise<
 *   | {
 *         type: "intent_program";
 *         summary: string;
 *         program: import("./types.js").IntentProgram;
 *     }
 *   | {
 *         type: "view_workflow";
 *         summary: string;
 *         workflow: import("./types.js").ResolvedViewWorkflow;
 *     }
 * >}
 */
async function prepareAgentProgramStep(app, step) {
    if (step.type === "intent_program") {
        const validation = validateIntentProgram(app, step.program);
        if (!validation.ok) {
            throw new Error(validation.errors.join("\n"));
        }

        return {
            type: "intent_program",
            summary: summarizeIntentProgram(app, validation.program).join("\n"),
            program: validation.program,
        };
    } else if (step.type === "view_workflow") {
        const workflow = await resolveViewWorkflowWithClarifications(
            app,
            step.workflow
        );
        return {
            type: "view_workflow",
            summary: summarizeResolvedViewWorkflow(workflow),
            workflow,
        };
    }

    throw new Error("Unsupported agent program step.");
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").ViewWorkflowRequest} workflowRequest
 * @returns {Promise<import("./types.js").ResolvedViewWorkflow>}
 */
async function resolveViewWorkflowWithClarifications(app, workflowRequest) {
    /** @type {import("./types.js").ViewWorkflowRequest} */
    let currentRequest = { ...workflowRequest };

    while (true) {
        const resolution = resolveViewWorkflow(app, currentRequest);
        if (resolution.status === "error") {
            throw new Error(resolution.message);
        } else if (resolution.status === "resolved") {
            return resolution.value;
        } else if (resolution.status === "needs_clarification") {
            const request = resolution.request;
            const followUp = await showAgentChoiceDialog({
                title: "Agent Clarification",
                message: request.message,
                choiceLabel: formatClarificationSlot(request.slot),
                options: request.options ?? [],
                value: request.initialValue,
            });
            if (!followUp) {
                throw new Error("View workflow clarification was cancelled.");
            }

            currentRequest = {
                ...currentRequest,
                ...request.state,
                [request.slot]: followUp.trim(),
            };
            continue;
        }

        throw new Error("Unsupported resolver status.");
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {{
 *   type: "intent_program",
 *   summary: string,
 *   program: import("./types.js").IntentProgram
 * } | {
 *   type: "view_workflow",
 *   summary: string,
 *   workflow: import("./types.js").ResolvedViewWorkflow
 * }} step
 */
async function executePreparedAgentProgramStep(app, step) {
    if (step.type === "intent_program") {
        const intentProgramResult = await submitIntentProgram(
            app,
            step.program
        );
        return {
            executedActions: intentProgramResult.executedActions,
            intentProgramResult,
        };
    } else {
        await executeResolvedViewWorkflow(app, step.workflow);
        return {
            executedActions: 1,
            intentProgramResult: undefined,
        };
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").IntentProgram} program
 * @param {string[]} errors
 */
function shouldRetryAsViewWorkflow(app, program, errors) {
    const workflowContext = getViewWorkflowContext(app);
    if (
        workflowContext.selections.length === 0 ||
        workflowContext.fields.length === 0
    ) {
        return false;
    }

    const hasUnknownSampleAttributeError = errors.some((error) =>
        error.includes('unknown attribute {"type":"SAMPLE_ATTRIBUTE"')
    );
    const hasQuantitativeFilterShapeError = errors.some(
        (error) =>
            error.includes("payload.operator must be one of") ||
            error.includes("payload.operand must be a finite number")
    );
    const hasSampleAttributePayload = (program.steps ?? []).some(
        (step) => step?.payload?.attribute?.type === "SAMPLE_ATTRIBUTE"
    );
    const hasSuspiciousTemplateLikeAttribute = (program.steps ?? []).some(
        (step) =>
            typeof step?.payload?.attribute?.specifier === "string" &&
            step.payload.attribute.specifier.includes("{{")
    );

    return (
        (hasUnknownSampleAttributeError && hasSampleAttributePayload) ||
        (hasQuantitativeFilterShapeError && hasSampleAttributePayload) ||
        hasSuspiciousTemplateLikeAttribute
    );
}

/**
 * @param {string[]} errors
 */
function buildInvalidProgramFeedback(errors) {
    return (
        "Previous planner output was invalid:\n" + errors.slice(0, 5).join("\n")
    );
}

/**
 * @param {string} originalMessage
 * @param {import("./types.js").ViewWorkflowRequest["workflowType"]} workflowType
 */
function buildViewWorkflowRepairMessage(originalMessage, workflowType) {
    const workflowInstruction =
        workflowType === "createBoxplotFromSelection"
            ? "Return a structured view_workflow for createBoxplotFromSelection if this request is about aggregating a visible field over the current selection and showing the result as a boxplot."
            : "Return a structured view_workflow for deriveMetadataFromSelection if this request is about aggregating a visible field over the current selection and storing the result in sample metadata.";

    return (
        originalMessage +
        "\n\n" +
        workflowInstruction +
        " Do not return a metadata intent_program unless the source is an existing SAMPLE_ATTRIBUTE."
    );
}

/**
 * @param {string[]} messages
 * @returns {{ workflowType: import("./types.js").ViewWorkflowRequest["workflowType"] }}
 */
function inferRequestedWorkflowType(messages) {
    const combined = messages.join("\n").toLowerCase();
    if (combined.includes("boxplot")) {
        return {
            workflowType: "createBoxplotFromSelection",
        };
    } else {
        return {
            workflowType: "deriveMetadataFromSelection",
        };
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {string} message
 * @param {import("./types.js").ViewWorkflowRequest["workflowType"]} workflowType
 * @returns {import("./types.js").ViewWorkflowRequest}
 */
function createSeededViewWorkflowRequest(app, message, workflowType) {
    return {
        workflowType,
        aggregation: inferRequestedAggregation(app, message),
    };
}

/**
 * @param {import("../app.js").default} app
 * @param {string} message
 * @returns {string | undefined}
 */
function inferRequestedAggregation(app, message) {
    const normalizedMessage = message.toLowerCase();
    const supportedAggregations = Array.from(
        new Set(
            getViewWorkflowContext(app).fields.flatMap(
                (field) => field.supportedAggregations
            )
        )
    );

    for (const aggregation of supportedAggregations) {
        if (normalizedMessage.includes(aggregation.toLowerCase())) {
            return aggregation;
        }
    }

    if (normalizedMessage.includes("weighted mean")) {
        return "weightedMean";
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {string} message
 */
function getGroundedPlannerClarification(app, message) {
    const workflowContext = getViewWorkflowContext(app);
    const normalizedMessage = message.toLowerCase();

    if (
        (normalizedMessage.includes("aggregation") ||
            normalizedMessage.includes("aggregate")) &&
        workflowContext.fields.length > 0
    ) {
        const aggregations = Array.from(
            new Set(
                workflowContext.fields.flatMap(
                    (field) => field.supportedAggregations
                )
            )
        );
        if (aggregations.length > 0) {
            const options = aggregations.map((aggregation) => ({
                value: aggregation,
                label: aggregation,
            }));
            return {
                slot: "aggregation",
                choiceLabel: "Aggregation",
                message:
                    message +
                    " Available options: " +
                    aggregations.join(", ") +
                    ".",
                options,
                value: options[0].value,
            };
        }
    }

    if (
        (normalizedMessage.includes("field") ||
            normalizedMessage.includes("attribute")) &&
        workflowContext.fields.length > 0
    ) {
        const fields = normalizedMessage.includes("quantitative")
            ? workflowContext.fields.filter(
                  (field) => field.dataType === "quantitative"
              )
            : workflowContext.fields;
        if (fields.length > 0) {
            const options = fields.map((field) => ({
                value: field.id,
                label: `${field.field} (${field.viewTitle})`,
            }));
            return {
                slot: "fieldId",
                choiceLabel: "Field",
                message:
                    message +
                    " Available options: " +
                    options.map((option) => option.label).join(", ") +
                    ".",
                options,
                value: options[0].value,
            };
        }
    }

    if (
        (normalizedMessage.includes("selection") ||
            normalizedMessage.includes("brush") ||
            normalizedMessage.includes("interval")) &&
        workflowContext.selections.length > 0
    ) {
        const options = workflowContext.selections.map((selection) => ({
            value: selection.id,
            label: selection.label,
        }));
        return {
            slot: "selectionId",
            choiceLabel: "Selection",
            message:
                message +
                " Available options: " +
                options.map((option) => option.label).join(", ") +
                ".",
            options,
            value: options[0].value,
        };
    }
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").ViewWorkflowRequest} workflowRequest
 * @param {Record<string, any>} trace
 * @param {number} startedAt
 * @returns {Promise<void>}
 */
async function runViewWorkflow(app, workflowRequest, trace, startedAt) {
    await runAgentProgram(
        app,
        [
            {
                type: "view_workflow",
                workflow: workflowRequest,
            },
        ],
        trace,
        startedAt
    );
}

/**
 * @param {string} slot
 * @returns {string}
 */
function formatClarificationSlot(slot) {
    if (slot === "selectionId") {
        return "Selection";
    } else if (slot === "fieldId") {
        return "Field";
    } else if (slot === "aggregation") {
        return "Aggregation";
    } else {
        return slot;
    }
}

/**
 * @param {import("./types.js").ResolvedViewWorkflow} workflow
 * @returns {string}
 */
function summarizeResolvedViewWorkflow(workflow) {
    if (workflow.workflowType === "createBoxplotFromSelection") {
        return (
            "Create a boxplot from " +
            workflow.aggregation +
            "(" +
            workflow.field.field +
            ") in " +
            workflow.selection.label +
            " on " +
            workflow.field.viewTitle
        );
    } else {
        return (
            "Add derived metadata " +
            workflow.name +
            " from " +
            workflow.aggregation +
            "(" +
            workflow.field.field +
            ") in " +
            workflow.selection.label +
            " on " +
            workflow.field.viewTitle
        );
    }
}

/**
 * @param {import("./types.js").ResolvedViewWorkflow} workflow
 * @returns {{
 *   attribute: import("../sampleView/types.js").AttributeIdentifier
 * }}
 */
function createSelectionAttribute(workflow) {
    return {
        attribute: {
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: workflow.field.view,
                field: workflow.field.field,
                interval: {
                    type: "selection",
                    selector: workflow.selection.selector,
                },
                aggregation: {
                    op: /** @type {import("../sampleView/types.js").AggregationOp} */ (
                        workflow.aggregation
                    ),
                },
            },
        },
    };
}

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").ResolvedViewWorkflow} workflow
 */
async function executeResolvedViewWorkflow(app, workflow) {
    const sampleView = app.getSampleView();
    if (!sampleView) {
        throw new Error("SampleView is not available.");
    }

    if (workflow.workflowType === "deriveMetadataFromSelection") {
        const getAttributeInfo =
            sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
                sampleView.compositeAttributeInfoSource
            );
        const action = sampleView.actions.deriveMetadata({
            ...createSelectionAttribute(workflow),
            name: workflow.name,
            groupPath: workflow.groupPath,
            scale: workflow.scale,
        });
        await app.intentPipeline.submit([action], { getAttributeInfo });
        return;
    } else if (workflow.workflowType === "createBoxplotFromSelection") {
        const attributeInfo =
            sampleView.compositeAttributeInfoSource.getAttributeInfo(
                createSelectionAttribute(workflow).attribute
            );
        await showHierarchyBoxplotDialog(
            attributeInfo,
            sampleView.sampleHierarchy,
            sampleView.compositeAttributeInfoSource
        );
        return;
    } else {
        throw new Error(
            "Unsupported resolved view workflow: " + workflow.workflowType + "."
        );
    }
}
